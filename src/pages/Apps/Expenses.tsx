import { useState, Fragment, useEffect, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import Swal from 'sweetalert2';
import { useDispatch } from 'react-redux';
import { setPageTitle } from '../../store/themeConfigSlice';
import IconSearch from '../../components/Icon/IconSearch';
import IconX from '../../components/Icon/IconX';
import IconPlus from '../../components/Icon/IconPlus';
import { Edit, Delete } from '@mui/icons-material';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

declare module 'jspdf' {
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
    }
}

const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface ExpenseItem {
    name: string;
    price: string;
}

interface Expense {
    id: number | null;
    expense_date: string;
    expense_note: string;
    expense_items: Record<string, string>;
    expense_total: string;
    expense_image_base64: string | File | null;
}

const defaultExpense: Expense = {
    id: null,
    expense_date: new Date().toISOString().split('T')[0],
    expense_note: '',
    expense_items: {},
    expense_total: '',
    expense_image_base64: null,
};

const ymd = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = (error) => reject(error);
    });
};

const Expenses = () => {
    const dispatch = useDispatch();
    useEffect(() => {
        dispatch(setPageTitle('Expenses'));
    }, [dispatch]);

    const [addExpenseModal, setAddExpenseModal] = useState(false);
    const [params, setParams] = useState<Expense>({ ...defaultExpense });
    const [items, setItems] = useState<ExpenseItem[]>([]);
    const [search, setSearch] = useState('');
    const [expenseList, setExpenseList] = useState<any[]>([]);
    const [filteredItems, setFilteredItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState<string | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [exportFilterType, setExportFilterType] = useState<'daily' | 'monthly' | 'yearly' | 'custom'>('monthly');
    const [exportStartDate, setExportStartDate] = useState<string>('');
    const [exportEndDate, setExportEndDate] = useState<string>('');

    const indexOfFirstItem = (currentPage - 1) * itemsPerPage;
    const currentItems = filteredItems.slice(indexOfFirstItem, indexOfFirstItem + itemsPerPage);
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;

    const fetchUser = async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
            console.error('Error fetching user:', error);
            return;
        }
        setUserEmail(data?.user?.email || null);
    };

    useEffect(() => {
        fetchUser();
    }, []);

    const fetchExpenses = useCallback(async () => {
        if (!userEmail) return;
        setLoading(true);
        Swal.fire({
            title: 'Loading expenses...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
        });
        try {
            const { data, error } = await supabase
                .from('expenses')
                .select('id, expense_date, expense_note, expense_items, expense_total, created_at')
                .eq('expense_company_email', userEmail)
                .order('expense_date', { ascending: false });

            if (error) throw error;
            setExpenseList(data || []);
            setFilteredItems(data || []);
            Swal.close();
        } catch (error) {
            console.error('Error fetching expenses:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to fetch expenses. Please try again.',
                confirmButtonText: 'OK',
            });
        } finally {
            setLoading(false);
        }
    }, [userEmail]);

    useEffect(() => {
        fetchExpenses();
    }, [fetchExpenses]);

    useEffect(() => {
        const searchLower = search.toLowerCase();
        const filtered = expenseList.filter(
            (e) =>
                e.expense_note?.toLowerCase().includes(searchLower) ||
                Object.keys(e.expense_items || {}).some((k) => k.toLowerCase().includes(searchLower))
        );
        setFilteredItems(filtered);
        setCurrentPage(1);
    }, [search, expenseList]);

    const addItemRow = () => {
        setItems([...items, { name: '', price: '' }]);
    };

    const removeItemRow = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: 'name' | 'price', value: string) => {
        const updated = [...items];
        updated[index] = { ...updated[index], [field]: value };
        setItems(updated);
    };

    const itemsToRecord = (): Record<string, string> => {
        const record: Record<string, string> = {};
        items.forEach((item) => {
            if (item.name.trim()) {
                record[item.name.trim()] = item.price.trim() || '0';
            }
        });
        return record;
    };

    const computeTotal = (record: Record<string, string>): string => {
        return Object.values(record).reduce((sum, p) => sum + (parseFloat(p) || 0), 0).toFixed(2);
    };

    const computeExportRange = useCallback((): { fromYMD: string; toYMD: string; label: string } => {
        const now = new Date();
        let from = new Date();
        let to = new Date();
        let label = '';
        if (exportFilterType === 'daily') {
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            label = format(from, 'dd MMM yyyy');
        } else if (exportFilterType === 'monthly') {
            from = new Date(now.getFullYear(), now.getMonth(), 1);
            to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            label = format(from, 'MMM yyyy');
        } else if (exportFilterType === 'yearly') {
            from = new Date(now.getFullYear(), 0, 1);
            to = new Date(now.getFullYear(), 11, 31);
            label = String(now.getFullYear());
        } else {
            from = exportStartDate ? new Date(exportStartDate) : new Date(now.getFullYear(), now.getMonth(), 1);
            to = exportEndDate ? new Date(exportEndDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
            label = `${exportStartDate || format(from, 'yyyy-MM-dd')} to ${exportEndDate || format(to, 'yyyy-MM-dd')}`;
        }
        return { fromYMD: ymd(from), toYMD: ymd(to), label };
    }, [exportFilterType, exportStartDate, exportEndDate]);

    const exportToPDF = async () => {
        const email = userEmail;
        if (!email) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Please log in to export.' });
            return;
        }
        const { fromYMD, toYMD, label } = computeExportRange();
        Swal.fire({ title: 'Exporting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const [
                { data: expensesData, error: expensesError },
                { data: companyData },
            ] = await Promise.all([
                supabase
                    .from('expenses')
                    .select('id, expense_date, expense_note, expense_items, expense_total')
                    .eq('expense_company_email', email)
                    .gte('expense_date', fromYMD)
                    .lte('expense_date', toYMD)
                    .order('expense_date', { ascending: false }),
                supabase.from('companies').select('company_username, address, phone_number').eq('company_email', email).single(),
            ]);

            if (expensesError) throw expensesError;
            Swal.close();

            const companyName = companyData?.company_username || '';
            const companyAddress = companyData?.address || '';
            const companyPhone = companyData?.phone_number || '';

            const expenses = (expensesData || []).map((e) => ({
                ...e,
                itemsStr: Object.entries(e.expense_items || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || '-',
            }));
            const totalAmount = expenses.reduce((sum, e) => sum + (parseFloat(e.expense_total) || 0), 0);

            const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
            const w = doc.internal.pageSize.getWidth();

            doc.setFillColor(13, 131, 144);
            doc.rect(0, 0, w, 70, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.text('Expenses Report', 40, 42);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.text(`Period: ${label}`, 40, 60);
            doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}`, w - 40, 60, { align: 'right' });

            let contentStartY = 95;
            if (companyName || companyAddress || companyPhone) {
                doc.setTextColor(40, 40, 40);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                if (companyName) doc.text(companyName, 40, contentStartY);
                doc.setFont('helvetica', 'normal');
                let lineY = contentStartY + 14;
                if (companyAddress) {
                    doc.text(companyAddress.substring(0, 80), 40, lineY);
                    lineY += 12;
                }
                if (companyPhone) {
                    doc.text(`Tel: ${companyPhone}`, 40, lineY);
                    lineY += 12;
                }
                doc.setDrawColor(200);
                doc.line(40, lineY + 4, w - 40, lineY + 4);
                contentStartY = lineY + 20;
            }
            doc.setTextColor(40, 40, 40);
            doc.setDrawColor(230);
            doc.setFillColor(248, 248, 248);
            doc.roundedRect(40, contentStartY, w - 80, 50, 8, 8, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.text('Total Expenses', 55, contentStartY + 22);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(16);
            doc.text(`Rs ${totalAmount.toFixed(2)}`, 55, contentStartY + 42);

            const rows = expenses.map((e) => [
                String(e.id),
                format(new Date(e.expense_date), 'dd MMM yyyy'),
                (e.expense_note || '-').substring(0, 40),
                e.itemsStr.substring(0, 60),
                `Rs ${(parseFloat(e.expense_total) || 0).toFixed(2)}`,
            ]);
            (doc as any).autoTable({
                startY: contentStartY + 70,
                head: [['ID', 'Date', 'Note', 'Items', 'Total']],
                body: rows,
                theme: 'striped',
                styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
                headStyles: { fillColor: [13, 131, 144], textColor: 255, fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 35 },
                    1: { cellWidth: 85 },
                    2: { cellWidth: 100 },
                    3: { cellWidth: 'auto' },
                    4: { cellWidth: 75, halign: 'right' },
                },
                didDrawPage: (dataCtx: any) => {
                    const pageH = doc.internal.pageSize.getHeight();
                    doc.setFontSize(9);
                    doc.setTextColor(130);
                    doc.text(`Page ${doc.getNumberOfPages()}`, w - 40, pageH - 25, { align: 'right' });
                    doc.setFontSize(8);
                    doc.text('MOJHOA AUTOMATIONS POS MANAGEMENT SYSTEM', w / 2, pageH - 12, { align: 'center' });
                },
                margin: { left: 40, right: 40 },
            });

            const endY = (doc as any).lastAutoTable?.finalY ?? contentStartY + 70;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(`Total: Rs ${totalAmount.toFixed(2)}`, 40, endY + 24);

            doc.save(`expenses_${exportFilterType}_${ymd(new Date())}.pdf`);
        } catch (err: any) {
            Swal.close();
            Swal.fire({ icon: 'error', title: 'Export Failed', text: err?.message || 'Could not export expenses.' });
        }
    };

    const saveExpense = async () => {
        let email = userEmail;
        if (!email) {
            const { data } = await supabase.auth.getUser();
            email = data?.user?.email || null;
            if (email) setUserEmail(email);
        }
        if (!email) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No authenticated user. Please log in again.',
            });
            return;
        }

        const record = itemsToRecord();
        if (Object.keys(record).length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Missing Items',
                text: 'Please add at least one expense item with a name.',
            });
            return;
        }

        try {
            let base64Image: string | null = null;
            if (params.expense_image_base64 instanceof File) {
                base64Image = await toBase64(params.expense_image_base64);
            } else if (typeof params.expense_image_base64 === 'string' && params.expense_image_base64) {
                base64Image = params.expense_image_base64;
            }

            const total = computeTotal(record);
            const payload = {
                expense_company_email: email,
                expense_date: params.expense_date,
                expense_note: params.expense_note || null,
                expense_items: record,
                expense_total: total,
                expense_image_base64: base64Image,
            };

            if (params.id) {
                const { error } = await supabase.from('expenses').update(payload).eq('id', params.id);
                if (error) throw error;
                Swal.fire({
                    icon: 'success',
                    title: 'Updated',
                    text: 'Expense has been updated successfully.',
                    timer: 2000,
                    showConfirmButton: false,
                });
            } else {
                const { error } = await supabase.from('expenses').insert([payload]);
                if (error) throw error;
                Swal.fire({
                    icon: 'success',
                    title: 'Added',
                    text: 'Expense has been added successfully.',
                    timer: 2000,
                    showConfirmButton: false,
                });
            }

            resetForm();
            setAddExpenseModal(false);
            fetchExpenses();
        } catch (error: any) {
            console.error('Error saving expense:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error?.message || 'Failed to save expense. Please try again.',
            });
        }
    };

    const resetForm = () => {
        setParams({ ...defaultExpense, expense_date: new Date().toISOString().split('T')[0] });
        setItems([]);
    };

    const editExpense = async (expense: any = null) => {
        if (expense) {
            Swal.fire({ title: 'Loading...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const { data } = await supabase
                    .from('expenses')
                    .select('expense_image_base64')
                    .eq('id', expense.id)
                    .single();
                const fullExpense = { ...expense, expense_image_base64: data?.expense_image_base64 || null };
                Swal.close();
                const itemsArr: ExpenseItem[] = Object.entries(fullExpense.expense_items || {}).map(([name, price]) => ({
                    name,
                    price: String(price),
                }));
                setParams({
                    id: fullExpense.id,
                    expense_date: fullExpense.expense_date || new Date().toISOString().split('T')[0],
                    expense_note: fullExpense.expense_note || '',
                    expense_items: fullExpense.expense_items || {},
                    expense_total: fullExpense.expense_total || '',
                    expense_image_base64: fullExpense.expense_image_base64 || null,
                });
                setItems(itemsArr.length ? itemsArr : [{ name: '', price: '' }]);
            } catch (err) {
                Swal.close();
                Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load expense details.' });
                return;
            }
        } else {
            resetForm();
            setItems([]);
        }
        setAddExpenseModal(true);
    };

    const deleteExpense = async (expense: any) => {
        const confirm = await Swal.fire({
            title: 'Are you sure you want to delete this expense?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Delete',
        });

        if (confirm.isConfirmed) {
            try {
                await supabase.from('expenses').delete().eq('id', expense.id);
                setExpenseList((prev) => prev.filter((e) => e.id !== expense.id));
                setFilteredItems((prev) => prev.filter((e) => e.id !== expense.id));
                Swal.fire({
                    icon: 'success',
                    title: 'Deleted!',
                    text: 'Expense has been deleted.',
                    timer: 2000,
                    showConfirmButton: false,
                });
            } catch (error) {
                console.error('Error deleting expense:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to delete expense.',
                });
            }
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl">Expenses</h2>
                <div className="flex sm:flex-row flex-col sm:items-center sm:gap-3 gap-4 w-full sm:w-auto">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search by note or item..."
                            className="form-input py-2 ltr:pr-11 rtl:pl-11 peer"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <button type="button" className="absolute ltr:right-[11px] rtl:left-[11px] top-1/2 -translate-y-1/2 peer-focus:text-primary">
                            <IconSearch className="mx-auto" />
                        </button>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => editExpense()}>
                        <IconPlus className="ltr:mr-2 rtl:ml-2" />
                        Add New Expense
                    </button>
                </div>
            </div>

            <div className="mt-5 panel p-4">
                <h3 className="text-base font-semibold mb-3">Export</h3>
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[160px]">
                        <label className="form-label">Period</label>
                        <select
                            className="form-select"
                            value={exportFilterType}
                            onChange={(e) => setExportFilterType(e.target.value as typeof exportFilterType)}
                        >
                            <option value="daily">Today</option>
                            <option value="monthly">This Month</option>
                            <option value="yearly">This Year</option>
                            <option value="custom">Custom Date Range</option>
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
                    <button type="button" className="btn btn-secondary" onClick={exportToPDF}>
                        Export PDF
                    </button>
                </div>
            </div>

            <div className="mt-5 panel p-0 border-0 overflow-hidden">
                <div className="table-responsive">
                    {loading ? (
                        <p className="text-center py-5">Loading...</p>
                    ) : filteredItems.length === 0 ? (
                        <p className="text-center py-5">No expenses yet. Add your first expense above.</p>
                    ) : (
                        <>
                            <table className="table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Note</th>
                                        <th>Items</th>
                                        <th>Total</th>
                                        <th className="!text-center whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentItems.map((expense) => (
                                        <tr key={expense.id}>
                                            <td>{expense.expense_date}</td>
                                            <td>{expense.expense_note || '-'}</td>
                                            <td>
                                                {Object.entries(expense.expense_items || {}).map(([k, v]) => (
                                                    <span key={k} className="block text-sm">
                                                        {`${k}: ${v}`}
                                                    </span>
                                                ))}
                                            </td>
                                            <td>{expense.expense_total || '-'}</td>
                                            <td className="text-center whitespace-nowrap">
                                                <div className="flex gap-2 items-center justify-center w-max mx-auto">
                                                    <button type="button" className="btn btn-sm btn-outline-primary shrink-0" onClick={() => editExpense(expense)}>
                                                        <Edit className="w-5 h-5" />
                                                    </button>
                                                    <button type="button" className="btn btn-sm btn-outline-danger shrink-0" onClick={() => deleteExpense(expense)}>
                                                        <Delete className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="flex justify-between items-center mt-4 p-4 shadow rounded-lg">
                                <div className="flex items-center space-x-2">
                                    <button
                                        className={`px-3 py-2 text-sm font-medium border rounded-md transition ${currentPage === 1 ? 'text-gray-500 cursor-not-allowed' : 'text-white hover:bg-primary-dark'}`}
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    >
                                        Prev
                                    </button>
                                    <span className="text-gray-700 font-medium">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        className={`px-3 py-2 text-sm font-medium border rounded-md transition ${currentPage === totalPages ? 'text-gray-500 cursor-not-allowed' : 'text-white hover:bg-primary-dark'}`}
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Add/Edit Modal */}
            <Transition appear show={addExpenseModal} as={Fragment}>
                <Dialog as="div" open={addExpenseModal} onClose={() => {}} className="relative z-[51]">
                    <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
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
                                <Dialog.Panel className="panel border-0 p-0 rounded-lg overflow-hidden w-full max-w-2xl text-black dark:text-white-dark max-h-[90vh] overflow-y-auto">
                                    <button
                                        type="button"
                                        onClick={() => setAddExpenseModal(false)}
                                        className="absolute top-4 ltr:right-4 rtl:left-4 text-gray-400 hover:text-gray-800 dark:hover:text-gray-600 outline-none z-10"
                                    >
                                        <IconX />
                                    </button>
                                    <div className="text-lg font-medium bg-[#fbfbfb] dark:bg-[#121c2c] ltr:pl-5 rtl:pr-5 py-3 ltr:pr-[50px] rtl:pl-[50px]">
                                        {params.id ? 'Edit Expense' : 'Add New Expense'}
                                    </div>
                                    <div className="p-5">
                                        <div className="mb-5">
                                            <label htmlFor="expense_date">Date</label>
                                            <input
                                                id="expense_date"
                                                type="date"
                                                className="form-input"
                                                value={params.expense_date}
                                                onChange={(e) => setParams({ ...params, expense_date: e.target.value })}
                                            />
                                        </div>

                                        <div className="mb-5">
                                            <label htmlFor="expense_note">Note</label>
                                            <textarea
                                                id="expense_note"
                                                rows={2}
                                                placeholder="Optional notes..."
                                                className="form-textarea resize-none"
                                                value={params.expense_note}
                                                onChange={(e) => setParams({ ...params, expense_note: e.target.value })}
                                            />
                                        </div>

                                        <div className="mb-5">
                                            <div className="flex justify-between items-center mb-2">
                                                <label>Items (Item name: Price)</label>
                                                <button type="button" className="btn btn-sm btn-outline-primary" onClick={addItemRow}>
                                                    <IconPlus className="w-4 h-4 ltr:mr-1 rtl:ml-1" />
                                                    Add Item
                                                </button>
                                            </div>
                                            {items.length === 0 ? (
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary w-full py-3"
                                                    onClick={() => setItems([{ name: '', price: '' }])}
                                                >
                                                    + Add first item
                                                </button>
                                            ) : (
                                                <div className="space-y-3">
                                                    {items.map((item, index) => (
                                                        <div key={index} className="flex gap-2 items-center">
                                                            <input
                                                                type="text"
                                                                placeholder="Item name"
                                                                className="form-input flex-1"
                                                                value={item.name}
                                                                onChange={(e) => updateItem(index, 'name', e.target.value)}
                                                            />
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                placeholder="Price"
                                                                className="form-input w-28"
                                                                value={item.price}
                                                                onChange={(e) => updateItem(index, 'price', e.target.value)}
                                                            />
                                                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeItemRow(index)}>
                                                                <IconX className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {items.length > 0 && (
                                                <p className="text-sm text-gray-500 mt-2">
                                                    Total: {computeTotal(itemsToRecord())}
                                                </p>
                                            )}
                                        </div>

                                        <div className="mb-5">
                                            <label htmlFor="expense_image">Receipt (Image)</label>
                                            <input
                                                id="expense_image"
                                                type="file"
                                                accept="image/*"
                                                className="form-input"
                                                onChange={(e) =>
                                                    setParams({
                                                        ...params,
                                                        expense_image_base64: e.target.files?.[0] || null,
                                                    })
                                                }
                                            />
                                            {params.expense_image_base64 && (
                                                <div className="mt-2">
                                                    {params.expense_image_base64 instanceof File ? (
                                                        <img
                                                            src={URL.createObjectURL(params.expense_image_base64)}
                                                            alt="Preview"
                                                            className="w-24 h-24 object-cover rounded border"
                                                        />
                                                    ) : (
                                                        <img
                                                            src={`data:image/jpeg;base64,${params.expense_image_base64}`}
                                                            alt="Receipt"
                                                            className="w-24 h-24 object-cover rounded border"
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex justify-end items-center mt-8 gap-2">
                                            <button type="button" className="btn btn-outline-danger" onClick={() => setAddExpenseModal(false)}>
                                                Cancel
                                            </button>
                                            <button type="button" className="btn btn-primary" onClick={saveExpense}>
                                                {params.id ? 'Update' : 'Add'}
                                            </button>
                                        </div>
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

export default Expenses;
