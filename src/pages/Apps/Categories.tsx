import { useState, Fragment, useEffect, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import Swal from 'sweetalert2';
import { useDispatch } from 'react-redux';
import { setPageTitle } from '../../store/themeConfigSlice';
import IconSearch from '../../components/Icon/IconSearch';
import IconX from '../../components/Icon/IconX';
import IconPlus from '../../components/Icon/IconPlus';
import axios from 'axios';
import { Visibility, Delete } from '@mui/icons-material';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const Categories = () => {
    const dispatch = useDispatch();
    useEffect(() => {
        dispatch(setPageTitle('Categories'));
    });

    const [addCategoryModal, setAddCategoryModal] = useState<boolean>(false);
    const [params, setParams] = useState({
        id: null,
        name: '',
        description: '',
    });

    const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
    const [search, setSearch] = useState<string>('');
    const [categoryList, setCategoryList] = useState<any[]>([]);
    const [filteredItems, setFilteredItems] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10); // Default: 5 per page
    // Fetch authenticated user
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

    const fetchCategories = useCallback(async () => {
        if (!userEmail) return;
        setLoading(true);
        Swal.fire({
            title: 'Fetching Products...',
            text: 'Please wait while we load your categories.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            },
        });
        try {
            const { data, error } = await supabase.from('categories').select('*').eq('category_company_email', userEmail);

            if (error) throw error;
            setCategoryList(data);
            setFilteredItems(data);
            setCurrentPage(1); // Reset to first page on data fetch
            Swal.close()
        } catch (error) {
            console.error('Error fetching categories:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to fetch categories. Please try again later.',
                confirmButtonText: 'OK',
            });
        } finally {
            setLoading(false);
        }
    }, [userEmail]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const changeValue = (e: any) => {
        const { value, id } = e.target;
        setParams({ ...params, [id]: value });

        // Clear the error for the field when the user starts typing
        setErrors((prevErrors) => ({
            ...prevErrors,
            [id]: undefined,
        }));
    };

    useEffect(() => {
        setFilteredItems(() => {
            return categoryList.filter((item) => item?.category_name?.toLowerCase().includes(search.toLowerCase()));
        });
    }, [search, categoryList]);

    const saveCategory = async () => {
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

        const newErrors: { name?: string; description?: string } = {};
        if (!params.name) newErrors.name = 'Category name is required.';
        if (!params.description) newErrors.description = 'Category description is required.';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const newCategory = {
            category_name: params.name,
            category_description: params.description,
            category_company_email: userEmail, // Link to authenticated user
        };

        try {
            if (params.id) {
                // Update existing category
                await supabase.from('categories').update(newCategory).eq('id', params.id);
                Swal.fire({
                    icon: 'success',
                    title: 'Category Updated',
                    text: 'The category has been updated successfully.',
                    timer: 3000,
                    showConfirmButton: false,
                });
            } else {
                // Add new category
                await supabase.from('categories').insert([newCategory]);
                Swal.fire({
                    icon: 'success',
                    title: 'Category Added',
                    text: 'The category has been added successfully.',
                    timer: 3000,
                    showConfirmButton: false,
                });
            }

            setAddCategoryModal(false);
            fetchCategories();
        } catch (error) {
            console.error('Error saving category:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to save category. Please try again later.',
                timer: 3000,
                showConfirmButton: false,
            });
        }
    };

    const editCategory = async (category: any = null) => {
        if (category) {
            setParams({
                id: category.id,
                name: category.category_name,
                description: category.category_description,
            });
        } else {
            setParams({
                id: null,
                name: '',
                description: '',
            });
        }
        setAddCategoryModal(true);
    };

    const deleteCategory = async (category: any) => {
        if (!userEmail) return;

        const confirm = await Swal.fire({
            title: `Are you sure you want to delete ${category.category_name}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Delete',
        });

        if (confirm.isConfirmed) {
            try {
                await supabase.from('categories').delete().eq('id', category.id);

                // Update local state
                setCategoryList((prevList) => prevList.filter((c) => c.id !== category.id));
                setFilteredItems((prevList) => prevList.filter((c) => c.id !== category.id));

                Swal.fire({
                    icon: 'success',
                    title: 'Deleted!',
                    text: 'The category has been deleted successfully.',
                    timer: 3000,
                    showConfirmButton: false,
                });
            } catch (error) {
                console.error('Error deleting category:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to delete category. Please try again later.',
                    timer: 3000,
                    showConfirmButton: false,
                });
            }
        }
    };

    // Pagination Logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredItems.slice(indexOfFirstItem, indexOfLastItem);

    // Total pages
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

    return (
        <div>
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-xl">Categories</h2>
                <div className="flex sm:flex-row flex-col sm:items-center sm:gap-3 gap-4 w-full sm:w-auto">
                    <div>
                        <button type="button" className="btn btn-primary" onClick={() => editCategory()}>
                            <IconPlus className="ltr:mr-2 rtl:ml-2" />
                            Add Category
                        </button>
                    </div>
                    <div className="relative">
                        <input type="text" placeholder="Search by" className="form-input py-2 ltr:pr-11 rtl:pl-11 peer" value={search} onChange={(e) => setSearch(e.target.value)} />
                        <button type="button" className="absolute ltr:right-[11px] rtl:left-[11px] top-1/2 -translate-y-1/2 peer-focus:text-primary">
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
                        <p className="text-center py-5">No categories available</p>
                    ) : (
                        <>
                            <table className="table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th>Category Name</th>
                                        <th>Category Description</th>
                                        <th className="!text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentItems.map((category) => (
                                        <tr key={category.id}>
                                            <td>{category.category_name}</td>
                                            <td>{category.category_description}</td>
                                            <td>
                                                <div className="flex gap-4 items-center justify-center">
                                                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => editCategory(category)}>
                                                        <Visibility className="w-5 h-5" />
                                                    </button>
                                                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteCategory(category)}>
                                                        <Delete className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {/* Styled Pagination Controls */}
                            <div className="flex justify-between items-center mt-4 p-4 shadow rounded-lg">
                                {/* <div>
                                    <span className="text-gray-600 font-medium">Show: </span>
                                    <select
                                        className="border border-gray-300 text-gray-700 p-2 rounded-md focus:ring-primary focus:border-primary"
                                        value={itemsPerPage}
                                        onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                    >
                                        <option value={5}>5</option>
                                        <option value={10}>10</option>
                                        <option value={15}>15</option>
                                    </select>
                                </div> */}
                                <div className="flex items-center space-x-2">
                                    <button
                                        className={`px-3 py-2 text-sm font-medium border rounded-md transition ${
                                            currentPage === 1 ? 'text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-dark'
                                        }`}
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(currentPage - 1)}
                                    >
                                        Prev
                                    </button>
                                    <span className="text-gray-700 font-medium">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        className={`px-3 py-2 text-sm font-medium border rounded-md transition ${
                                            currentPage === totalPages ? 'text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-dark'
                                        }`}
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(currentPage + 1)}
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
            <Transition appear show={addCategoryModal} as={Fragment}>
                <Dialog as="div" open={addCategoryModal} onClose={() => setAddCategoryModal(false)} className="relative z-[51]">
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
                                <Dialog.Panel className="panel border-0 p-0 rounded-lg overflow-hidden w-full max-w-lg text-black dark:text-white-dark">
                                    <button
                                        type="button"
                                        onClick={() => setAddCategoryModal(false)}
                                        className="absolute top-4 ltr:right-4 rtl:left-4 text-gray-400 hover:text-gray-800 dark:hover:text-gray-600 outline-none"
                                    >
                                        <IconX />
                                    </button>
                                    <div className="text-lg font-medium bg-[#fbfbfb] dark:bg-[#121c2c] ltr:pl-5 rtl:pr-5 py-3 ltr:pr-[50px] rtl:pl-[50px]">
                                        {params.id ? 'Edit Category' : 'Add Category'}
                                    </div>
                                    <div className="p-5">
                                        <form>
                                            <div className="mb-5">
                                                <label htmlFor="name">Category Name</label>
                                                <input
                                                    id="name"
                                                    type="text"
                                                    placeholder="Enter Category Name"
                                                    className={`form-input ${errors.name ? 'border-red-500' : ''}`}
                                                    value={params.name}
                                                    onChange={(e) => changeValue(e)}
                                                />
                                                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
                                            </div>
                                            <div className="mb-5">
                                                <label htmlFor="description">Category Description</label>
                                                <textarea
                                                    id="description"
                                                    rows={3}
                                                    placeholder="Enter Category Description"
                                                    className={`form-textarea resize-none ${errors.description ? 'border-red-500' : ''}`}
                                                    value={params.description}
                                                    onChange={(e) => changeValue(e)}
                                                ></textarea>
                                                {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
                                            </div>
                                            <div className="flex justify-end items-center mt-8">
                                                <button type="button" className="btn btn-outline-danger" onClick={() => setAddCategoryModal(false)}>
                                                    Cancel
                                                </button>
                                                <button type="button" className="btn btn-primary ltr:ml-4 rtl:mr-4" onClick={saveCategory}>
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

export default Categories;
