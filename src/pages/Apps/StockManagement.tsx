import { useState, useEffect, useCallback, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useDispatch } from 'react-redux';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Visibility } from '@mui/icons-material';
import IconCaretDown from '../../components/Icon/IconCaretDown';
import { createClient } from '@supabase/supabase-js';
import { setPageTitle } from '../../store/themeConfigSlice';

declare module 'jspdf' {
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
    }
}

const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface ProductRow {
    id: number;
    name: string;
    code: string;
    category: string;
    currentQty: number;
    image?: string | null;
}

interface MovementRow {
    id: number;
    product_id: number;
    quantity_change: number;
    movement_type: string;
    note: string | null;
    created_at: string;
}

const StockManagement = () => {
    const dispatch = useDispatch();
    const [loading, setLoading] = useState<boolean>(true);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [movements, setMovements] = useState<MovementRow[]>([]);
    const [search, setSearch] = useState<string>('');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortBy, setSortBy] = useState<'totalIn' | 'totalOut' | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const itemsPerPage = 10;

    const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
    const [adjustQty, setAdjustQty] = useState<string>('');
    const [adjustType, setAdjustType] = useState<string>('in');
    const [adjustNote, setAdjustNote] = useState<string>('');

    useEffect(() => {
        dispatch(setPageTitle('Stock Management'));
    }, [dispatch]);

    const fetchUser = useCallback(async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
            console.error('Error fetching user:', error);
            return;
        }
        setUserEmail(data?.user?.email || null);
    }, []);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const fetchData = useCallback(async () => {
        if (!userEmail) return;
        setLoading(true);

        Swal.fire({
            title: 'Loading stock...',
            text: 'Please wait while we load your stock details.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            },
        });

        try {
            const [{ data: productData, error: productError }, { data: movementData, error: movementError }] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, product_name, product_code, product_category, product_qty, product_image')
                    .eq('product_company_email', userEmail),
                supabase
                    .from('stock_movements')
                    .select('id, product_id, quantity_change, movement_type, note, created_at')
                    .eq('movement_company_email', userEmail)
                    .order('created_at', { ascending: false }),
            ]);

            if (productError) throw productError;
            if (movementError) throw movementError;

            const productRows: ProductRow[] =
                productData?.map((p: any) => ({
                    id: p.id,
                    name: p.product_name,
                    code: p.product_code,
                    category: p.product_category,
                    currentQty: Number(p.product_qty) || 0,
                    image: p.product_image || null,
                })) || [];

            setProducts(productRows);

            const movementRows: MovementRow[] =
                movementData?.map((m: any) => ({
                    id: m.id,
                    product_id: m.product_id,
                    quantity_change: Number(m.quantity_change) || 0,
                    movement_type: m.movement_type,
                    note: m.note ?? null,
                    created_at: m.created_at,
                })) || [];

            setMovements(movementRows);
        } catch (error) {
            console.error('Error loading stock data:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to load stock data. Please try again later.',
                confirmButtonText: 'OK',
            });
        } finally {
            setLoading(false);
            Swal.close();
        }
    }, [userEmail]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredProducts = products.filter((p) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
            p.name.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q)
        );
    });

    const computeTotals = (productId: number) => {
        const rel = movements.filter((m) => m.product_id === productId);
        let totalIn = 0;
        let totalOut = 0;
        rel.forEach((m) => {
            if (m.quantity_change > 0) totalIn += m.quantity_change;
            if (m.quantity_change < 0) totalOut += Math.abs(m.quantity_change);
        });
        return { totalIn, totalOut };
    };

    const toggleSort = (col: 'totalIn' | 'totalOut') => {
        if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        else {
            setSortBy(col);
            setSortDir('desc');
        }
        setCurrentPage(1);
    };

    const sortedProducts = sortBy
        ? [...filteredProducts].sort((a, b) => {
              const { totalIn: aIn, totalOut: aOut } = computeTotals(a.id);
              const { totalIn: bIn, totalOut: bOut } = computeTotals(b.id);
              const aVal = sortBy === 'totalIn' ? aIn : aOut;
              const bVal = sortBy === 'totalIn' ? bIn : bOut;
              return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
          })
        : filteredProducts;

    const totalPages = Math.max(1, Math.ceil(sortedProducts.length / itemsPerPage));
    const pagedProducts = sortedProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const getProductMovements = (productId: number) => {
        return movements
            .filter((m) => m.product_id === productId)
            .slice(0, 50); // limit for modal
    };

    const handleAdjustStock = async () => {
        if (!userEmail || !selectedProduct) return;

        const qtyNumber = Number(adjustQty);
        if (!Number.isFinite(qtyNumber) || qtyNumber === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Invalid quantity',
                text: 'Please enter a non-zero number.',
            });
            return;
        }

        const newQty = selectedProduct.currentQty + qtyNumber;
        if (newQty < 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Invalid stock',
                text: 'Resulting stock cannot be negative.',
            });
            return;
        }

        Swal.fire({
            title: 'Updating stock...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
        });

        try {
            const { error: updateError } = await supabase
                .from('products')
                .update({ product_qty: String(newQty) })
                .eq('id', selectedProduct.id);

            if (updateError) throw updateError;

            const { data: inserted, error: insertError } = await supabase
                .from('stock_movements')
                .insert([
                    {
                        movement_company_email: userEmail,
                        product_id: selectedProduct.id,
                        quantity_change: qtyNumber,
                        movement_type: adjustType,
                        note: adjustNote || null,
                    },
                ])
                .select()
                .single();

            if (insertError) throw insertError;

            setProducts((prev) =>
                prev.map((p) => (p.id === selectedProduct.id ? { ...p, currentQty: newQty } : p)),
            );

            setSelectedProduct((prev) =>
                prev ? { ...prev, currentQty: newQty } : prev,
            );

            if (inserted) {
                const m: MovementRow = {
                    id: inserted.id,
                    product_id: inserted.product_id,
                    quantity_change: Number(inserted.quantity_change) || 0,
                    movement_type: inserted.movement_type,
                    note: inserted.note ?? null,
                    created_at: inserted.created_at,
                };
                setMovements((prev) => [m, ...prev]);
            }

            setAdjustQty('');
            setAdjustNote('');

            Swal.fire({
                icon: 'success',
                title: 'Stock updated',
                timer: 2000,
                showConfirmButton: false,
            });
        } catch (error) {
            console.error('Error adjusting stock:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to adjust stock. Please try again later.',
            });
        }
    };

    const exportToPdf = () => {
        if (sortedProducts.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'No data',
                text: 'There is no stock data to export.',
            });
            return;
        }

        Swal.fire({
            title: 'Generating PDF...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
        });

        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
            const w = doc.internal.pageSize.getWidth();

            doc.setFillColor(13, 131, 144);
            doc.rect(0, 0, w, 70, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.text('Stock Report', 40, 36);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text('All products', 40, 52);
            doc.text(`Generated: ${new Date().toLocaleString()}`, w - 40, 52, { align: 'right' });
            const totalStock = sortedProducts.reduce((sum, p) => sum + p.currentQty, 0);
            doc.text(`Products: ${sortedProducts.length}`, 40, 64);
            doc.text(`Total Stock: ${totalStock}`, w - 40, 64, { align: 'right' });

            // Sort by Total Out descending for PDF
            const pdfProducts = [...sortedProducts].sort((a, b) => {
                const { totalOut: aOut } = computeTotals(a.id);
                const { totalOut: bOut } = computeTotals(b.id);
                return bOut - aOut;
            });

            const rows = pdfProducts.map((p) => {
                const { totalIn, totalOut } = computeTotals(p.id);
                return [
                    (p.name || '-').substring(0, 45),
                    p.code || '-',
                    (p.category || '-').substring(0, 15),
                    String(p.currentQty),
                    String(totalIn),
                    String(totalOut),
                ];
            });

            const tableWidth = w - 80;
            (doc as any).autoTable({
                startY: 90,
                head: [['Product', 'Code', 'Category', 'Current Stock', 'Total In', 'Total Out']],
                body: rows,
                theme: 'striped',
                styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
                headStyles: { fillColor: [13, 131, 144], textColor: 255, fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 155 },
                    1: { cellWidth: 80 },
                    2: { cellWidth: 90 },
                    3: { cellWidth: 55, halign: 'center' },
                    4: { cellWidth: 65, halign: 'center' },
                    5: { cellWidth: 70, halign: 'center' },
                },
                margin: { left: 40, right: 40 },
                tableWidth,
                didDrawPage: (dataCtx: any) => {
                    const pageH = doc.internal.pageSize.getHeight();
                    doc.setFontSize(9);
                    doc.setTextColor(130);
                    doc.text(`Page ${doc.getNumberOfPages()}`, w - 40, pageH - 20, { align: 'right' });
                },
            });

            const dateStr = new Date().toISOString().slice(0, 10);
            doc.save(`stock_report_${dateStr}.pdf`);
            Swal.close();
            Swal.fire({
                icon: 'success',
                title: 'Exported',
                text: 'Stock report has been downloaded.',
                timer: 2000,
                showConfirmButton: false,
            });
        } catch (err: any) {
            Swal.close();
            Swal.fire({
                icon: 'error',
                title: 'Export Failed',
                text: err?.message || 'Could not export to PDF.',
            });
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl">Stock Management</h2>
                <div className="flex sm:flex-row flex-col sm:items-center sm:gap-3 gap-4 w-full sm:w-auto">
                    <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={exportToPdf}
                        disabled={loading || sortedProducts.length === 0}
                    >
                        Export to PDF
                    </button>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search by name, code or category"
                            className="form-input py-2 ltr:pr-11 rtl:pl-11 peer"
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>
                </div>
            </div>

            <div className="mt-5 panel p-0 border-0 overflow-hidden">
                <div className="table-responsive">
                    {loading ? (
                        <p className="text-center py-5">Loading...</p>
                    ) : filteredProducts.length === 0 ? (
                        <p className="text-center py-5">No products found</p>
                    ) : (
                        <>
                            <table className="table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th>Image</th>
                                        <th>Product</th>
                                        <th>Code</th>
                                        <th>Category</th>
                                        <th>Current Stock</th>
                                        <th>
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 hover:text-primary"
                                                onClick={() => toggleSort('totalIn')}
                                            >
                                                Total In
                                                <IconCaretDown
                                                    className={`w-4 h-4 shrink-0 ${sortBy === 'totalIn' ? '' : 'opacity-40'} ${sortBy === 'totalIn' && sortDir === 'asc' ? 'rotate-180' : ''}`}
                                                />
                                            </button>
                                        </th>
                                        <th>
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 hover:text-primary"
                                                onClick={() => toggleSort('totalOut')}
                                            >
                                                Total Out
                                                <IconCaretDown
                                                    className={`w-4 h-4 shrink-0 ${sortBy === 'totalOut' ? '' : 'opacity-40'} ${sortBy === 'totalOut' && sortDir === 'asc' ? 'rotate-180' : ''}`}
                                                />
                                            </button>
                                        </th>
                                        <th className="!text-center">History</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedProducts.map((p) => {
                                        const { totalIn, totalOut } = computeTotals(p.id);
                                        return (
                                            <tr key={p.id}>
                                                <td>
                                                    {p.image && (
                                                        <img
                                                            src={`data:image/jpeg;base64,${p.image}`}
                                                            alt={p.name}
                                                            className="w-12 h-12 object-cover rounded"
                                                        />
                                                    )}
                                                </td>
                                                <td>{p.name}</td>
                                                <td>{p.code}</td>
                                                <td>{p.category}</td>
                                                <td>{p.currentQty}</td>
                                                <td>{totalIn}</td>
                                                <td>{totalOut}</td>
                                                <td>
                                                    <div className="flex items-center justify-center">
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-outline-primary"
                                                            onClick={() => setSelectedProduct(p)}
                                                        >
                                                            <Visibility className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {sortedProducts.length > itemsPerPage && (
                                <div className="flex justify-center mt-4">
                                    <button
                                        className={`px-4 py-2 border ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                    >
                                        Previous
                                    </button>
                                    <span className="px-4 py-2">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        className={`px-4 py-2 border ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <Transition appear show={selectedProduct !== null} as={Fragment}>
                <Dialog as="div" open={selectedProduct !== null} onClose={() => setSelectedProduct(null)} className="relative z-[51]">
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-[black]/60" />
                    </Transition.Child>
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center px-4 py-8">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 scale-95"
                                enterTo="opacity-100 scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                <Dialog.Panel className="panel border-0 p-0 rounded-lg overflow-hidden w-full max-w-xl text-black dark:text-white-dark">
                                    <div className="flex items-center justify-between bg-[#fbfbfb] dark:bg-[#121c2c] px-5 py-3">
                                        <h3 className="text-lg font-medium">
                                            Stock History – {selectedProduct?.name} ({selectedProduct?.code})
                                        </h3>
                                        <button
                                            type="button"
                                            className="text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                                            onClick={() => setSelectedProduct(null)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
                                        {selectedProduct && (
                                            <div className="border rounded p-3 space-y-3">
                                                <h4 className="text-sm font-semibold">Adjust stock</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                                    <div>
                                                        <label className="text-xs block mb-1">Quantity (+ add / - remove)</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            value={adjustQty}
                                                            onChange={(e) => setAdjustQty(e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs block mb-1">Movement</label>
                                                        <select
                                                            className="form-select"
                                                            value={adjustType}
                                                            onChange={(e) => setAdjustType(e.target.value)}
                                                        >
                                                            <option value="in">In</option>
                                                            <option value="out">Out</option>
                                                        </select>
                                                    </div>
                                                    <div className="flex justify-end">
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary mt-4 md:mt-0"
                                                            onClick={handleAdjustStock}
                                                        >
                                                            Apply
                                                        </button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs block mb-1">Note (optional)</label>
                                                    <textarea
                                                        rows={2}
                                                        className="form-textarea"
                                                        value={adjustNote}
                                                        onChange={(e) => setAdjustNote(e.target.value)}
                                                    />
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    Current stock: <span className="font-semibold">{selectedProduct.currentQty}</span>
                                                </div>
                                            </div>
                                        )}

                                        {selectedProduct && getProductMovements(selectedProduct.id).length === 0 && (
                                            <p className="text-center text-sm text-gray-500">No movements for this product yet.</p>
                                        )}
                                        {selectedProduct && getProductMovements(selectedProduct.id).length > 0 && (
                                            <ul className="space-y-2 text-sm">
                                                {getProductMovements(selectedProduct.id).map((m) => (
                                                    <li
                                                        key={m.id}
                                                        className="border rounded px-3 py-2 flex items-center justify-between gap-3"
                                                    >
                                                        <div>
                                                            <div className="font-medium capitalize">
                                                                {m.movement_type.replace('_', ' ')}
                                                            </div>
                                                            {m.note && (
                                                                <div className="text-xs text-gray-500 mt-0.5">{m.note}</div>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <div
                                                                className={
                                                                    m.quantity_change >= 0
                                                                        ? 'text-green-600 font-semibold'
                                                                        : 'text-red-600 font-semibold'
                                                                }
                                                            >
                                                                {m.quantity_change >= 0 ? '+' : ''}
                                                                {m.quantity_change}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {new Date(m.created_at).toLocaleString()}
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </div>
    );
};

export default StockManagement;

