import { Link, NavLink } from 'react-router-dom';
import { DataTable, DataTableSortStatus } from 'mantine-datatable';
import { useState, useEffect } from 'react';
import sortBy from 'lodash/sortBy';
import { useDispatch } from 'react-redux';
import { setPageTitle } from '../../../store/themeConfigSlice';
import IconPlus from '../../../components/Icon/IconPlus';
import { Visibility, Delete } from '@mui/icons-material';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { createClient } from '@supabase/supabase-js';

declare module 'jspdf' {
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
    }
}

// ✅ Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const List = () => {
    const dispatch = useDispatch();
    useEffect(() => {
        dispatch(setPageTitle('Invoice List'));
    }, [dispatch]);

    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [items, setItems] = useState<any[]>([]);
    const [records, setRecords] = useState<any[]>([]);
    const [initialRecords, setInitialRecords] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus>({
        columnAccessor: 'invoice',
        direction: 'desc',
    });
    const [page, setPage] = useState(1);
    const PAGE_SIZES = [10, 20, 30, 50, 100];
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

    const [exportFilterType, setExportFilterType] = useState<'daily' | 'monthly' | 'yearly' | 'custom'>('all' as any);
    const [exportStartDate, setExportStartDate] = useState<string>('');
    const [exportEndDate, setExportEndDate] = useState<string>('');

    const totalSales = items.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalVat = totalSales * 0.15;
    const totalSalesAfterVat = totalSales * 0.85;
    const totalOrderProfit = items.reduce((sum, inv) => sum + (inv.profit || 0), 0);
    const totalProfit = totalOrderProfit - totalVat;

    const computeExportRange = () => {
        const now = new Date();
        let from = new Date();
        let to = new Date();
        let label = '';

        if (exportFilterType === 'daily') {
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            label = from.toLocaleDateString();
        } else if (exportFilterType === 'monthly') {
            from = new Date(now.getFullYear(), now.getMonth(), 1);
            to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            label = from.toLocaleDateString('en', { month: 'long', year: 'numeric' });
        } else if (exportFilterType === 'yearly') {
            from = new Date(now.getFullYear(), 0, 1);
            to = new Date(now.getFullYear(), 11, 31);
            label = String(now.getFullYear());
        } else if (exportFilterType === 'custom') {
            from = exportStartDate ? new Date(exportStartDate) : new Date(now.getFullYear(), now.getMonth(), 1);
            to = exportEndDate ? new Date(exportEndDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
            label = `${exportStartDate || from.toISOString().slice(0, 10)} to ${exportEndDate || to.toISOString().slice(0, 10)}`;
        } else {
            // 'all'
            from = new Date(1970, 0, 1);
            to = new Date(2999, 11, 31);
            label = 'All time';
        }

        return { from, to, label };
    };

    const getInvoicesForExport = () => {
        const { from, to } = computeExportRange();
        const fromTime = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
        const toTime = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();

        return items.filter((inv) => {
            if (!inv.date) return exportFilterType === ('all' as any);
            const d = new Date(inv.date);
            const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            return t >= fromTime && t <= toTime;
        });
    };

    const exportToPdf = () => {
        if (exportFilterType === 'custom' && (!exportStartDate || !exportEndDate)) {
            Swal.fire({
                icon: 'warning',
                title: 'Missing dates',
                text: 'Please select both Start and End dates for the custom range.',
            });
            return;
        }

        const toExport = getInvoicesForExport();
        if (!toExport.length) {
            Swal.fire({
                icon: 'warning',
                title: 'No data',
                text: 'There are no invoices to export for the selected period.',
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

            const { label } = computeExportRange();

            doc.setFillColor(13, 131, 144);
            doc.rect(0, 0, w, 70, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.text('Invoices Report', 40, 36);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(label, 40, 52);
            doc.text(`Generated: ${new Date().toLocaleString()}`, w - 40, 52, { align: 'right' });
            doc.text(`Invoices: ${toExport.length}`, 40, 64);

            // Summary cards for this export subset
            const subsetTotal = toExport.reduce((sum, inv) => sum + (inv.total || 0), 0);
            const subsetVat = subsetTotal * 0.15;
            const subsetSalesAfterVat = subsetTotal * 0.85;
            const subsetOrderProfit = toExport.reduce((sum, inv) => sum + (inv.profit || 0), 0);
            const subsetProfit = subsetOrderProfit - subsetVat;

            const cardStartY = 90;
            const cardHeight = 60;
            const cardGap = 20;
            const cardWidth = (w - 80 - cardGap * 3) / 4;

            doc.setDrawColor(230);
            doc.setFillColor(248, 248, 248);
            doc.roundedRect(40, cardStartY, cardWidth, cardHeight, 8, 8, 'FD');
            doc.roundedRect(40 + cardWidth + cardGap, cardStartY, cardWidth, cardHeight, 8, 8, 'FD');
            doc.roundedRect(40 + (cardWidth + cardGap) * 2, cardStartY, cardWidth, cardHeight, 8, 8, 'FD');
            doc.roundedRect(40 + (cardWidth + cardGap) * 3, cardStartY, cardWidth, cardHeight, 8, 8, 'FD');

            doc.setTextColor(40, 40, 40);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('Total Invoices', 55, cardStartY + 22);
            doc.text('Total VAT (15%)', 55 + cardWidth + cardGap, cardStartY + 22);
            doc.text('Total After VAT', 55 + (cardWidth + cardGap) * 2, cardStartY + 22);
            doc.text('Total Profit', 55 + (cardWidth + cardGap) * 3, cardStartY + 22);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(14);
            doc.text(`Rs ${subsetTotal.toFixed(2)}`, 55, cardStartY + 45);
            doc.text(`Rs ${subsetVat.toFixed(2)}`, 55 + cardWidth + cardGap, cardStartY + 45);
            doc.text(`Rs ${subsetSalesAfterVat.toFixed(2)}`, 55 + (cardWidth + cardGap) * 2, cardStartY + 45);
            doc.text(`Rs ${subsetProfit.toFixed(2)}`, 55 + (cardWidth + cardGap) * 3, cardStartY + 45);

            const rows = toExport.map((inv) => [
                inv.invoice || '-',
                inv.name || '-',
                (inv.email || '-').substring(0, 40),
                inv.date || '-',
                `Rs ${inv.amount || '0.00'}`,
                inv.statusLabel || '-',
            ]);

            const tableWidth = w - 80;
            (doc as any).autoTable({
                startY: cardStartY + cardHeight + 30,
                head: [['Invoice #', 'Name', 'Email', 'Date', 'Amount', 'Status']],
                body: rows,
                theme: 'striped',
                styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
                headStyles: { fillColor: [13, 131, 144], textColor: 255, fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 70 },
                    1: { cellWidth: 110 },
                    2: { cellWidth: 150 },
                    3: { cellWidth: 70 },
                    4: { cellWidth: 60, halign: 'right' },
                    5: { cellWidth: 55 },
                },
                margin: { left: 40, right: 40 },
                tableWidth,
                didDrawPage: () => {
                    const pageH = doc.internal.pageSize.getHeight();
                    doc.setFontSize(9);
                    doc.setTextColor(130);
                    doc.text(`Page ${doc.getNumberOfPages()}`, w - 40, pageH - 20, { align: 'right' });
                },
            });

            const dateStr = new Date().toISOString().slice(0, 10);
            doc.save(`invoices_report_${dateStr}.pdf`);
            Swal.close();
            Swal.fire({
                icon: 'success',
                title: 'Exported',
                text: 'Invoices report has been downloaded.',
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

    // ✅ Fetch authenticated user
    useEffect(() => {
        const fetchUser = async () => {
            const { data, error } = await supabase.auth.getUser();
            if (error) {
                console.error('Error fetching user:', error);
                return;
            }
            setUserEmail(data?.user?.email || null);
        };

        fetchUser();
    }, []);

    // ✅ Fetch invoices based on authenticated user's company email
    useEffect(() => {
        if (!userEmail) return; // Ensure email is available before fetching

        const fetchInvoices = async () => {
            Swal.fire({
                title: 'Fetching Invoices...',
                text: 'Please wait while we load your Invoices.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                },
            });
            try {
                const { data, error } = await supabase
                    .from('invoices')
                    .select('*')
                    .eq('inv_company_email', userEmail); // ✅ Fetch invoices for authenticated user's company

                if (error) throw error;

                const invoices = data.map((invoice: any) => {
                    const total = parseFloat(invoice.inv_total ?? 0) || 0;
                    const profit = parseFloat(invoice.inv_profit ?? 0) || 0;
                    const isPaid = !!invoice.inv_status;
                    const statusLabel = isPaid ? 'Paid' : 'Pending';
                    return {
                        id: invoice.id,
                        invoice: invoice.inv_num,
                        name: invoice.inv_bill_name,
                        email: invoice.inv_email,
                        date: invoice.inv_date,
                        amount: total.toFixed(2),
                        total,
                        profit,
                        statusLabel,
                        isPaid,
                    };
                });

                const sorted = sortBy(invoices, 'invoice').reverse();

                setItems(invoices);
                setInitialRecords(sorted);
                setRecords(sorted.slice(0, pageSize));
                Swal.close();
            } catch (error) {
                console.error('Error fetching invoices:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to fetch invoices. Please try again later.',
                    confirmButtonText: 'OK',
                });
            }
        };

        fetchInvoices();
    }, [userEmail, pageSize]);

    useEffect(() => {
        const filtered = initialRecords.filter((item) =>
            ['invoice', 'name', 'email', 'date', 'amount', 'statusLabel'].some((key) =>
                item[key]?.toString().toLowerCase().includes(search.toLowerCase()),
            ),
        );
        const sortedFiltered = sortBy(filtered, sortStatus.columnAccessor);
        setRecords(sortStatus.direction === 'desc' ? sortedFiltered.reverse() : sortedFiltered);
    }, [search, initialRecords, sortStatus]);

    useEffect(() => {
        const from = (page - 1) * pageSize;
        const to = from + pageSize;
        setRecords(initialRecords.slice(from, to));
    }, [page, pageSize, initialRecords]);

    const deleteRow = async (id: any = null) => {
        if (!id) return;

        const result = await Swal.fire({
            title: 'Are you sure?',
            text: 'You won’t be able to undo this action!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, delete it!',
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('invoices').delete().eq('id', id);
                if (error) throw error;

                const updatedItems = items.filter((item) => item.id !== id);
                setItems(updatedItems);
                setInitialRecords(updatedItems);
                setRecords(updatedItems.slice(0, pageSize));

                await Swal.fire('Deleted!', 'The invoice has been deleted.', 'success');
            } catch (error) {
                console.error('Error deleting invoice:', error);
                await Swal.fire('Error!', 'Failed to delete the invoice. Please try again.', 'error');
            }
        }
    };

    const markAsPaid = async (id: any = null) => {
        if (!id) return;

        const target = items.find((inv) => inv.id === id);
        if (!target) return;
        if (target.isPaid) {
            Swal.fire({
                icon: 'info',
                title: 'Already paid',
                text: 'This invoice is already marked as Paid.',
            });
            return;
        }

        const result = await Swal.fire({
            title: 'Mark as Paid?',
            text: 'This will mark the invoice as Paid.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, mark as Paid',
        });

        if (!result.isConfirmed) return;

        try {
            const { error } = await supabase.from('invoices').update({ inv_status: true }).eq('id', id);
            if (error) throw error;

            const updatedItems = items.map((inv) =>
                inv.id === id ? { ...inv, isPaid: true, statusLabel: 'Paid' } : inv,
            );
            const sorted = sortBy(updatedItems, 'invoice').reverse();

            setItems(updatedItems);
            setInitialRecords(sorted);
            setRecords(sorted.slice(0, pageSize));

            await Swal.fire('Updated!', 'Invoice has been marked as Paid.', 'success');
        } catch (error) {
            console.error('Error updating invoice status:', error);
            await Swal.fire('Error!', 'Failed to update invoice status. Please try again.', 'error');
        }
    };

    return (
        <div className="panel px-0 border-white-light dark:border-[#1b2e4b]">
            <div className="invoice-table">
                <div className="mb-4.5 px-5 flex flex-wrap md:items-end gap-4">
                    <div className="flex-grow md:flex-grow-0 w-full md:w-auto">
                        <input type="text" className="form-input w-full md:w-auto" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="flex flex-wrap items-end gap-3 flex-grow md:flex-grow-0 w-full md:w-auto">
                        <div className="min-w-[160px]">
                            <label className="form-label">Period</label>
                            <select
                                className="form-select"
                                value={exportFilterType}
                                onChange={(e) => setExportFilterType(e.target.value as any)}
                            >
                                <option value="daily">Today</option>
                                <option value="monthly">This Month</option>
                                <option value="yearly">This Year</option>
                                <option value="custom">Custom Date Range</option>
                                <option value="all">All</option>
                            </select>
                        </div>
                        {exportFilterType === 'custom' && (
                            <>
                                <div>
                                    <label className="form-label">Start Date</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={exportStartDate}
                                        onChange={(e) => setExportStartDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">End Date</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={exportEndDate}
                                        onChange={(e) => setExportEndDate(e.target.value)}
                                    />
                                </div>
                            </>
                        )}
                        <div className="flex items-center gap-3">
                            <button type="button" className="btn btn-outline-primary flex items-center gap-2" onClick={exportToPdf}>
                                Export to PDF
                            </button>
                            <Link to="/invoice/add" className="btn btn-primary gap-2 flex items-center">
                                <IconPlus />
                                Add New
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Summary cards - Total Sales, Total VAT, Total Sales After VAT, Total Profit */}
                <div className="px-5">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-2 mb-5">
                        <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                            <h2 className="text-lg text-gray-500 dark:text-gray-400">Total Invoices</h2>
                            <p className="text-xl font-semibold text-gray-800 dark:text-white">
                                Rs {totalSales.toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                            <h2 className="text-lg text-gray-500 dark:text-gray-400">Total VAT (15%)</h2>
                            <p className="text-xl font-semibold text-gray-800 dark:text-white">
                                Rs {totalVat.toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                            <h2 className="text-lg text-gray-500 dark:text-gray-400">Total After VAT</h2>
                            <p className="text-xl font-semibold text-gray-800 dark:text-white">
                                Rs {totalSalesAfterVat.toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                            <h2 className="text-lg text-gray-500 dark:text-gray-400">Total Profit</h2>
                            <p className="text-xl font-semibold text-gray-800 dark:text-white">
                                Rs {totalProfit.toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="datatables pagination-padding">
                    <DataTable
                        className="whitespace-nowrap table-hover invoice-table"
                        records={records}
                        columns={[
                            {
                                accessor: 'invoice',
                                sortable: true,
                                render: ({ invoice }) => <div className="font-semibold">{`#${invoice}`}</div>,
                            },
                            {
                                accessor: 'name',
                                sortable: true,
                                render: ({ name }) => <div className="font-semibold">{name}</div>,
                            },
                            {
                                accessor: 'email',
                                sortable: true,
                            },
                            {
                                accessor: 'date',
                                sortable: true,
                            },
                            {
                                accessor: 'amount',
                                sortable: true,
                                render: ({ amount }) => <div className="font-semibold">{`Rs ${amount}`}</div>,
                            },
                            {
                                accessor: 'status',
                                title: 'Status',
                                sortable: false,
                                render: ({ isPaid, statusLabel }) => (
                                    <span
                                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                            isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                        }`}
                                    >
                                        {statusLabel}
                                    </span>
                                ),
                            },
                            {
                                accessor: 'action',
                                title: 'Actions',
                                sortable: false,
                                render: ({ id, isPaid }) => (
                                    <div className="flex gap-2 items-center justify-center">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-primary"
                                            onClick={() => window.open(`/apps/invoice/preview/${id}`, '_blank')}
                                        >
                                            <Visibility className="w-5 h-5" />
                                        </button>
                                        {!isPaid && (
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-success"
                                                onClick={() => markAsPaid(id)}
                                            >
                                                Mark as Paid
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-danger"
                                            onClick={() => deleteRow(id)}
                                        >
                                            <Delete className="w-5 h-5" />
                                        </button>
                                    </div>
                                ),
                            },
                        ]}
                        highlightOnHover
                        totalRecords={initialRecords.length}
                        recordsPerPage={pageSize}
                        page={page}
                        onPageChange={setPage}
                        recordsPerPageOptions={PAGE_SIZES}
                        onRecordsPerPageChange={setPageSize}
                        sortStatus={sortStatus}
                        onSortStatusChange={setSortStatus}
                    />
                </div>
            </div>
        </div>
    );
};

export default List;
