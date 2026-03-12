import { Link, NavLink } from 'react-router-dom';
import { DataTable, DataTableSortStatus } from 'mantine-datatable';
import { useState, useEffect } from 'react';
import sortBy from 'lodash/sortBy';
import { useDispatch } from 'react-redux';
import { setPageTitle } from '../../../store/themeConfigSlice';
import IconTrashLines from '../../../components/Icon/IconTrashLines';
import IconPlus from '../../../components/Icon/IconPlus';
import IconEye from '../../../components/Icon/IconEye';
import axios from 'axios';
import Swal from 'sweetalert2';
import { createClient } from '@supabase/supabase-js';

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
    const [selectedRecords, setSelectedRecords] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus>({
        columnAccessor: 'invoice',
        direction: 'asc',
    });
    const [page, setPage] = useState(1);
    const PAGE_SIZES = [10, 20, 30, 50, 100];
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

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

                const invoices = data.map((invoice: any) => ({
                    id: invoice.id,
                    invoice: invoice.inv_num,
                    name: invoice.inv_bill_name,
                    email: invoice.inv_email,
                    date: invoice.inv_date,
                    amount: parseFloat(invoice.inv_total).toFixed(2),
                    status: {
                        tooltip: invoice.inv_status ? 'Paid' : 'Pending',
                        color: invoice.inv_status ? 'success' : 'danger',
                    },
                }));

                setItems(invoices);
                setInitialRecords(sortBy(invoices, 'invoice'));
                setRecords(sortBy(invoices, 'invoice').slice(0, pageSize));
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
            ['invoice', 'name', 'email', 'date', 'amount', 'status.tooltip'].some((key) => item[key]?.toString().toLowerCase().includes(search.toLowerCase()))
        );
        setRecords(sortBy(filtered, sortStatus.columnAccessor));
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

    return (
        <div className="panel px-0 border-white-light dark:border-[#1b2e4b]">
            <div className="invoice-table">
                <div className="mb-4.5 px-5 flex flex-wrap md:items-center gap-4">
                    <div className="flex-grow md:flex-grow-0 w-full md:w-auto">
                        <input type="text" className="form-input w-full md:w-auto" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="flex-grow md:flex-grow-0 w-full md:w-auto">
                        <Link to="/invoice/add" className="btn btn-primary gap-2 flex items-center">
                            <IconPlus />
                            Add New
                        </Link>
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
                                render: ({ id, invoice }) => (
                                    <NavLink to={`/apps/invoice/preview/${id}`}>
                                        <div className="text-primary underline hover:no-underline font-semibold">{`#${invoice}`}</div>
                                    </NavLink>
                                ),
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
                                accessor: 'action',
                                title: 'Actions',
                                sortable: false,
                                render: ({ id }) => (
                                    <div className="flex gap-4 items-center w-max mx-auto">
                                        <NavLink to={`/apps/invoice/preview/${id}`}>
                                            <IconEye />
                                        </NavLink>
                                        <button type="button" className="flex hover:text-danger" onClick={() => deleteRow(id)}>
                                            <IconTrashLines />
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
                        selectedRecords={selectedRecords}
                        onSelectedRecordsChange={setSelectedRecords}
                    />
                </div>
            </div>
        </div>
    );
};

export default List;
