import { useState, Fragment, useEffect, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import Swal from 'sweetalert2';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useDispatch } from 'react-redux';
import { setPageTitle } from '../../store/themeConfigSlice';
import IconSearch from '../../components/Icon/IconSearch';
import IconX from '../../components/Icon/IconX';
import IconPlus from '../../components/Icon/IconPlus';
import { Visibility, Delete } from '@mui/icons-material';
import { createClient } from '@supabase/supabase-js';

declare module 'jspdf' {
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
    }
}

const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Supplier {
    id: number | null;
    fname: string;
    lname: string;
    email: string;
    phone: string;
    address: string;
}

interface Errors {
    fname?: string;
    lname?: string;
    email?: string;
    phone?: string;
    address?: string;
}

const Suppliers = () => {
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(setPageTitle('Suppliers'));
    }, [dispatch]);

    const [addSupplierModal, setAddSupplierModal] = useState<boolean>(false);
    const [params, setParams] = useState<Supplier>({
        id: null,
        fname: '',
        lname: '',
        email: '',
        phone: '',
        address: '',
    });

    const [errors, setErrors] = useState<Errors>({});
    const [search, setSearch] = useState<string>('');
    const [supplierList, setSupplierList] = useState<Supplier[]>([]);
    const [filteredItems, setFilteredItems] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [userEmail, setUserEmail] = useState<string | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredItems.slice(indexOfFirstItem, indexOfLastItem);
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

    const fetchSuppliers = useCallback(async () => {
        if (!userEmail) return;
        setLoading(true);

        Swal.fire({
            title: 'Fetching Suppliers...',
            text: 'Please wait while we load your suppliers.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            },
        });

        try {
            const { data, error } = await supabase.from('suppliers').select('*').eq('supplier_company_email', userEmail);

            if (error) throw error;

            const formatted: Supplier[] = (data || []).map((item: any) => ({
                id: item.id,
                fname: item.fname,
                lname: item.lname,
                email: item.email,
                phone: item.phone,
                address: item.address,
            }));

            setSupplierList(formatted);
            setFilteredItems(formatted);
            setCurrentPage(1);
            Swal.close();
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to fetch suppliers. Please try again later.',
                confirmButtonText: 'OK',
            });
        } finally {
            setLoading(false);
        }
    }, [userEmail]);

    useEffect(() => {
        fetchSuppliers();
    }, [fetchSuppliers]);

    const changeValue = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setParams({ ...params, [id]: value });
        setErrors((prev) => ({ ...prev, [id]: undefined }));
    };

    useEffect(() => {
        const filtered = supplierList.filter((item) => {
            const term = search.toLowerCase().trim();
            return (
                item.fname.toLowerCase().includes(term) ||
                item.lname.toLowerCase().includes(term) ||
                item.email.toLowerCase().includes(term) ||
                item.phone.toLowerCase().includes(term)
            );
        });
        setFilteredItems(filtered);
        setCurrentPage(1);
    }, [search, supplierList]);

    const validate = (): boolean => {
        const newErrors: Errors = {};

        if (!params.fname) newErrors.fname = 'First name is required.';
        if (!params.lname) newErrors.lname = 'Last name is required.';
        if (!params.email) newErrors.email = 'Email is required.';
        if (!params.phone) newErrors.phone = 'Phone is required.';
        if (!params.address) newErrors.address = 'Address is required.';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const saveSupplier = async () => {
        if (!userEmail) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No authenticated user. Please log in again.',
                timer: 3000,
                showConfirmButton: false,
            });
            return;
        }

        if (!validate()) return;

        const payload = {
            supplier_company_email: userEmail,
            fname: params.fname,
            lname: params.lname,
            email: params.email,
            phone: params.phone,
            address: params.address,
        };

        try {
            if (params.id) {
                await supabase.from('suppliers').update(payload).eq('id', params.id);
                Swal.fire({
                    icon: 'success',
                    title: 'Supplier Updated',
                    text: 'The supplier has been updated successfully.',
                    timer: 3000,
                    showConfirmButton: false,
                });
            } else {
                await supabase.from('suppliers').insert([payload]);
                Swal.fire({
                    icon: 'success',
                    title: 'Supplier Added',
                    text: 'The supplier has been added successfully.',
                    timer: 3000,
                    showConfirmButton: false,
                });
            }

            setAddSupplierModal(false);
            setParams({
                id: null,
                fname: '',
                lname: '',
                email: '',
                phone: '',
                address: '',
            });
            fetchSuppliers();
        } catch (error) {
            console.error('Error saving supplier:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to save supplier. Please try again later.',
                timer: 3000,
                showConfirmButton: false,
            });
        }
    };

    const editSupplier = (supplier: Supplier | null = null) => {
        if (supplier) {
            setParams({ ...supplier });
        } else {
            setParams({
                id: null,
                fname: '',
                lname: '',
                email: '',
                phone: '',
                address: '',
            });
        }
        setErrors({});
        setAddSupplierModal(true);
    };

    const deleteSupplier = async (supplier: Supplier) => {
        if (!userEmail || !supplier.id) return;

        const confirm = await Swal.fire({
            title: `Are you sure you want to delete ${supplier.fname} ${supplier.lname}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Delete',
        });

        if (confirm.isConfirmed) {
            try {
                await supabase.from('suppliers').delete().eq('id', supplier.id);
                setSupplierList((prev) => prev.filter((s) => s.id !== supplier.id));
                setFilteredItems((prev) => prev.filter((s) => s.id !== supplier.id));

                Swal.fire({
                    icon: 'success',
                    title: 'Deleted!',
                    text: 'The supplier has been deleted successfully.',
                    timer: 3000,
                    showConfirmButton: false,
                });
            } catch (error) {
                console.error('Error deleting supplier:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to delete supplier. Please try again later.',
                    timer: 3000,
                    showConfirmButton: false,
                });
            }
        }
    };

    const exportToPdf = () => {
        if (filteredItems.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'No data',
                text: 'There is no supplier data to export.',
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
            doc.text('Suppliers Report', 40, 36);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text('All suppliers', 40, 52);
            doc.text(`Generated: ${new Date().toLocaleString()}`, w - 40, 52, { align: 'right' });
            doc.text(`Suppliers: ${filteredItems.length}`, 40, 64);

            const rows = filteredItems.map((s) => [
                s.fname || '-',
                s.lname || '-',
                (s.email || '-').substring(0, 40),
                s.phone || '-',
                (s.address || '-').substring(0, 55),
            ]);

            const tableWidth = w - 80;
            (doc as any).autoTable({
                startY: 90,
                head: [['First Name', 'Last Name', 'Email', 'Phone', 'Address']],
                body: rows,
                theme: 'striped',
                styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
                headStyles: { fillColor: [13, 131, 144], textColor: 255, fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 75 },
                    1: { cellWidth: 75 },
                    2: { cellWidth: 130 },
                    3: { cellWidth: 95 },
                    4: { cellWidth: 140 },
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
            doc.save(`suppliers_report_${dateStr}.pdf`);
            Swal.close();
            Swal.fire({
                icon: 'success',
                title: 'Exported',
                text: 'Suppliers report has been downloaded.',
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
                <h2 className="text-xl">Suppliers</h2>
                <div className="flex sm:flex-row flex-col sm:items-center sm:gap-3 gap-4 w-full sm:w-auto">
                    <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={exportToPdf}
                        disabled={loading || filteredItems.length === 0}
                    >
                        Export to PDF
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => editSupplier()}>
                        <IconPlus className="ltr:mr-2 rtl:ml-2" />
                        Add Supplier
                    </button>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search by name, email or phone"
                            className="form-input py-2 ltr:pr-11 rtl:pl-11 peer"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <button
                            type="button"
                            className="absolute ltr:right-[11px] rtl:left-[11px] top-1/2 -translate-y-1/2 peer-focus:text-primary"
                        >
                            <IconSearch className="mx-auto" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="mt-5 panel p-0 border-0 overflow-hidden">
                <div className="table-responsive">
                    {loading ? (
                        <p className="text-center py-5">Loading...</p>
                    ) : filteredItems.length === 0 ? (
                        <p className="text-center py-5">No suppliers available</p>
                    ) : (
                        <>
                            <table className="table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th>First Name</th>
                                        <th>Last Name</th>
                                        <th>Email</th>
                                        <th>Phone</th>
                                        <th>Address</th>
                                        <th className="!text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentItems.map((supplier) => (
                                        <tr key={supplier.id ?? `${supplier.email}-${supplier.phone}`}>
                                            <td>{supplier.fname}</td>
                                            <td>{supplier.lname}</td>
                                            <td>{supplier.email}</td>
                                            <td>{supplier.phone}</td>
                                            <td>{supplier.address}</td>
                                            <td>
                                                <div className="flex gap-4 items-center justify-center">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-primary"
                                                        onClick={() => editSupplier(supplier)}
                                                    >
                                                        <Visibility className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-danger"
                                                        onClick={() => deleteSupplier(supplier)}
                                                    >
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
                                        className={`px-3 py-2 text-sm font-medium border rounded-md transition ${
                                            currentPage === 1 ? 'text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-dark'
                                        }`}
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                    >
                                        Prev
                                    </button>
                                    <span className="text-gray-700 font-medium">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        className={`px-3 py-2 text-sm font-medium border rounded-md transition ${
                                            currentPage === totalPages
                                                ? 'text-gray-500 cursor-not-allowed'
                                                : 'bg-primary text-white hover:bg-primary-dark'
                                        }`}
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <Transition appear show={addSupplierModal} as={Fragment}>
                <Dialog as="div" open={addSupplierModal} onClose={() => setAddSupplierModal(false)} className="relative z-[51]">
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
                                <Dialog.Panel className="panel border-0 p-0 rounded-lg overflow-hidden w-full max-w-lg text-black dark:text-white-dark">
                                    <button
                                        type="button"
                                        onClick={() => setAddSupplierModal(false)}
                                        className="absolute top-4 ltr:right-4 rtl:left-4 text-gray-400 hover:text-gray-800 dark:hover:text-gray-600 outline-none"
                                    >
                                        <IconX />
                                    </button>
                                    <div className="text-lg font-medium bg-[#fbfbfb] dark:bg-[#121c2c] ltr:pl-5 rtl:pr-5 py-3 ltr:pr-[50px] rtl:pl-[50px]">
                                        {params.id ? 'Edit Supplier' : 'Add Supplier'}
                                    </div>
                                    <div className="p-5">
                                        <form>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                <div className="mb-5">
                                                    <label htmlFor="fname">First Name</label>
                                                    <input
                                                        id="fname"
                                                        type="text"
                                                        placeholder="Enter First Name"
                                                        className={`form-input ${errors.fname ? 'border-red-500' : ''}`}
                                                        value={params.fname}
                                                        onChange={changeValue}
                                                    />
                                                    {errors.fname && <p className="text-red-500 text-sm mt-1">{errors.fname}</p>}
                                                </div>
                                                <div className="mb-5">
                                                    <label htmlFor="lname">Last Name</label>
                                                    <input
                                                        id="lname"
                                                        type="text"
                                                        placeholder="Enter Last Name"
                                                        className={`form-input ${errors.lname ? 'border-red-500' : ''}`}
                                                        value={params.lname}
                                                        onChange={changeValue}
                                                    />
                                                    {errors.lname && <p className="text-red-500 text-sm mt-1">{errors.lname}</p>}
                                                </div>
                                                <div className="mb-5">
                                                    <label htmlFor="email">Email</label>
                                                    <input
                                                        id="email"
                                                        type="email"
                                                        placeholder="Enter Email"
                                                        className={`form-input ${errors.email ? 'border-red-500' : ''}`}
                                                        value={params.email}
                                                        onChange={changeValue}
                                                    />
                                                    {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                                                </div>
                                                <div className="mb-5">
                                                    <label htmlFor="phone">Phone</label>
                                                    <input
                                                        id="phone"
                                                        type="text"
                                                        placeholder="Enter Phone"
                                                        className={`form-input ${errors.phone ? 'border-red-500' : ''}`}
                                                        value={params.phone}
                                                        onChange={changeValue}
                                                    />
                                                    {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
                                                </div>
                                                <div className="mb-5 md:col-span-2">
                                                    <label htmlFor="address">Address</label>
                                                    <textarea
                                                        id="address"
                                                        rows={3}
                                                        placeholder="Enter Address"
                                                        className={`form-textarea resize-none ${errors.address ? 'border-red-500' : ''}`}
                                                        value={params.address}
                                                        onChange={changeValue}
                                                    ></textarea>
                                                    {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
                                                </div>
                                            </div>
                                            <div className="flex justify-end items-center mt-8">
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-danger"
                                                    onClick={() => setAddSupplierModal(false)}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary ltr:ml-4 rtl:mr-4"
                                                    onClick={saveSupplier}
                                                >
                                                    {params.id ? 'Update' : 'Add'}
                                                </button>
                                            </div>
                                        </form>
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

export default Suppliers;

