import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { setPageTitle } from '../../../store/themeConfigSlice';
import IconX from '../../../components/Icon/IconX';
import Swal from 'sweetalert2'; // Import SweetAlert
import IconSave from '../../../components/Icon/IconSave';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

// ✅ Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
interface Product {
    id: number;
    name: string;
    description: string;
    sellingPrice: number; // Change from string → number ✅
    manufacturedPrice: number; // Change from string → number ✅
    code: string;
    category: string;
    stock: number; // Change from string → number ✅
    image: string | File | null;
}
interface InvoiceItem {
    id: number;
    selectedProductId: number | null;
    title: string;
    description: string;
    rate: number;
    quantity: number;
    amount: number;
}
const Add: React.FC = (): JSX.Element => {
    const dispatch = useDispatch();
    const navigate = useNavigate(); // ✅ Initialize useNavigate
    // ✅ Ensure page title is set once (prevents infinite re-renders)
    useEffect(() => {
        dispatch(setPageTitle('Invoice Add'));
    }, [dispatch]);

    const today = new Date().toISOString().split('T')[0];
    const [productList, setProductList] = useState<Product[]>([]);
    const [filteredItems, setFilteredItems] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [subtotal, setSubtotal] = useState(0);
    const [discount, setDiscount] = useState(0);
    const [total, setTotal] = useState(0);
    const [items, setItems] = useState<InvoiceItem[]>([
        {
            id: 1,
            selectedProductId: null,
            title: '',
            description: '',
            rate: 0,
            quantity: 0,
            amount: 0,
        },
    ]);

    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [companyLogo, setCompanyLogo] = useState<string | null>(null);
    const [companyAddress, setCompanyAddress] = useState<string>('');
    const [companyEmail, setCompanyEmail] = useState<string>('');
    const [companyPhone, setCompanyPhone] = useState<string>('');
    const [companyName, setCompanyName] = useState<string>('');

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

    useEffect(() => {
        if (!userEmail) return;

        const fetchCompanyDetails = async () => {
            Swal.fire({
                title: 'Loading...',
                text: 'Fetching details...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                },
            });
            try {
                const { data, error } = await supabase.from('companies').select('company_logo, address, company_email, phone_number,company_username ').eq('company_email', userEmail).single();

                if (error) {
                    console.error('Error fetching company details:', error);
                    return;
                }

                if (data) {
                    setCompanyAddress(data.address || 'No address available');
                    setCompanyEmail(data.company_email || 'No email available');
                    setCompanyPhone(data.phone_number || 'No phone available');
                    setCompanyName(data.company_username || 'No name available');

                    // ✅ Directly use Base64 string
                    if (data.company_logo) {
                        setCompanyLogo(data.company_logo); // ✅ Base64 image is already stored
                    }
                }
                Swal.close();
            } catch (error) {
                console.error('Error fetching company data:', error);
                Swal.fire('Error', 'Failed to fetch details', 'error');
            }
        };

        fetchCompanyDetails();
    }, [userEmail]);

    // ✅ Fetch Invoice Count from Supabase
    useEffect(() => {
        if (!userEmail) return;

        const fetchInvoiceCount = async () => {
            try {
                const { count, error } = await supabase
                    .from('invoices')
                    .select('*', { count: 'exact', head: true }) // ✅ Proper way to count rows
                    .eq('inv_company_email', userEmail);

                if (error) throw error;

                setInvoiceNumber(`INV-${(count || 0) + 1}`); // ✅ Ensure count is always valid
            } catch (error) {
                console.error('Error fetching invoice count:', error);
            }
        };

        fetchInvoiceCount();
    }, [userEmail]);

    useEffect(() => {
        if (!userEmail) return; // Ensure user is authenticated before fetching

        const fetchProducts = async () => {
            try {
                const { data, error } = await supabase
                    .from('products') // ✅ Ensure correct table name
                    .select('id, product_name, product_description, product_selling_price, product_manufacturing_price, product_code, product_category, product_qty, product_image')
                    .eq('product_company_email', userEmail); // ✅ Fetch only products linked to the logged-in user

                if (error) throw error;
                if (!data || data.length === 0) {
                    console.warn('No products found for this user.');
                }

                // ✅ Convert necessary fields from strings to numbers
                const formattedData = data.map((item) => ({
                    id: Number(item.id), // Ensure ID is a number
                    name: item.product_name,
                    description: item.product_description,
                    sellingPrice: parseFloat(item.product_selling_price), // Convert price to number
                    manufacturedPrice: parseFloat(item.product_manufacturing_price),
                    code: item.product_code,
                    category: item.product_category,
                    stock: parseInt(item.product_qty, 10), // Ensure stock is a number
                    image: item.product_image, // Assuming Base64, keep as is
                }));

                setProductList(formattedData);
                setFilteredItems(formattedData);
            } catch (error) {
                console.error('Error fetching products:', error);
                Swal.fire('Error', 'Failed to fetch products. Check console for details.', 'error');
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, [userEmail]); // ✅ Triggered only when `userEmail` changes

    const [invoiceNumber, setInvoiceNumber] = useState('');

    useEffect(() => {
        const calculatedSubtotal = items.reduce((sum: any, item: any) => sum + item.quantity * item.rate, 0);
        setSubtotal(calculatedSubtotal);
        const calculatedTotal = calculatedSubtotal - (calculatedSubtotal * discount) / 100;
        setTotal(calculatedTotal);
    }, [items, discount]);

    const handleSave = async () => {
        if (!userEmail) {
            Swal.fire('Error', 'No authenticated user found. Please log in.', 'error');
            return;
        }
        // ✅ Calculate total profit (Selling Price - Manufacturing Price) * Quantity
        const totalProfit = items.reduce((profit, item) => {
            const product = productList.find((p) => p.id === item.selectedProductId);
            if (!product) return profit; // Skip if product is not found
            const itemProfit = (product.sellingPrice - product.manufacturedPrice) * item.quantity;
            return profit + itemProfit;
        }, 0);
        // ✅ Gather form data
        const invoiceData = {
            inv_num: invoiceNumber,
            inv_date: today,
            inv_due_date: (document.getElementById('dueDate') as HTMLInputElement)?.value.trim() || '',
            inv_bill_name: (document.getElementById('reciever-name') as HTMLInputElement)?.value.trim() || '',
            inv_email: (document.getElementById('reciever-email') as HTMLInputElement)?.value.trim() || '',
            inv_address: (document.getElementById('reciever-address') as HTMLInputElement)?.value.trim() || '',
            inv_phone: (document.getElementById('reciever-number') as HTMLInputElement)?.value.trim() || '',
            inv_acc_num: (document.getElementById('acno') as HTMLInputElement)?.value.trim() || '',
            inv_bank_name: (document.getElementById('bank-name') as HTMLInputElement)?.value.trim() || '',
            inv_items: items.length > 0 ? JSON.stringify(items) : '',
            inv_subtotal: subtotal,
            inv_discount: discount,
            inv_total: total,
            inv_notes: (document.getElementById('notes') as HTMLTextAreaElement)?.value.trim() || '',
            inv_status: false,
            inv_profit: totalProfit,
            inv_label: (document.getElementById('invoiceLabel') as HTMLInputElement)?.value.trim() || '',
        };

        // ✅ Check for missing required fields
        const missingFields: string[] = [];
        if (!invoiceData.inv_due_date) missingFields.push('Due Date');
        if (!invoiceData.inv_bill_name) missingFields.push('Receiver Name');
        if (!invoiceData.inv_email) missingFields.push('Receiver Email');
        if (!invoiceData.inv_address) missingFields.push('Receiver Address');
        if (!invoiceData.inv_phone) missingFields.push('Receiver Phone');
        if (!invoiceData.inv_acc_num) missingFields.push('Account Number');
        if (!invoiceData.inv_bank_name) missingFields.push('Bank Name');
        if (!invoiceData.inv_label) missingFields.push('Invoice Label');

        // ✅ Ensure at least one product is selected
        if (items.length === 0) {
            missingFields.push('At least one Product');
        } else {
            const invalidProducts = items.filter((item) => !item.selectedProductId);
            if (invalidProducts.length > 0) {
                missingFields.push('At least one product should be selected');
            }
        }

        // ✅ Ensure all products have qty > 0
        const invalidQuantities = items.filter((item) => item.quantity <= 0);
        if (invalidQuantities.length > 0) {
            missingFields.push('All products must have a quantity greater than 0');
        }

        // ✅ Prevent save if any required fields are missing
        if (missingFields.length > 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Missing Fields',
                html: `Please fill the following fields:<br><strong>${missingFields.join(', ')}</strong>`,
                confirmButtonText: 'OK',
            });
            return; // ✅ STOP execution if validation fails
        }

        try {
            const { error } = await supabase.from('invoices').insert([
                {
                    ...invoiceData,
                    inv_company_email: userEmail, // ✅ Link invoice to authenticated user
                },
            ]);

            if (error) throw error;

            Swal.fire({
                icon: 'success',
                title: 'Invoice Saved',
                text: 'Your invoice has been saved successfully!',
                confirmButtonText: 'OK',
            }).then(() => {
                navigate('/invoice'); // ✅ Redirect to invoices page
            });
        } catch (error) {
            console.error('Error saving invoice:', error);
            Swal.fire('Error', 'Failed to save the invoice. Please try again.', 'error');
        }
    };

    const addItem = () => {
        let maxId = items.length > 0 ? Math.max(...items.map((item) => item.id)) : 0;

        setItems([
            ...items,
            {
                id: maxId + 1,
                selectedProductId: null,
                title: '',
                description: '',
                rate: 0,
                quantity: 0,
                amount: 0,
            },
        ]);
    };

    const removeItem = (item: InvoiceItem) => {
        setItems(items.filter((d) => d.id !== item.id));
    };

    const changeQuantityPrice = (type: 'quantity' | 'price', value: string, id: number) => {
        setItems((prevItems) =>
            prevItems.map((item) =>
                item.id === id
                    ? {
                          ...item,
                          [type]: Number(value),
                      }
                    : item
            )
        );
    };

    const companyLogoBase64 = localStorage.getItem('company_logo');

    return (
        <div className="flex xl:flex-row flex-col gap-2.5">
            <div className="panel px-0 flex-1 py-6 ltr:xl:mr-6 rtl:xl:ml-6">
                <div className="flex justify-between flex-wrap px-4">
                    <div className="mb-6 lg:w-1/2 w-full">
                        <div className="flex items-center text-black dark:text-white shrink-0">
                            {companyLogo ? <img src={companyLogo} alt="Company Logo" className="w-14" /> : <img src="/assets/images/logo.svg" alt="Default Logo" className="w-14" />}
                        </div>

                        <div className="space-y-1 mt-6 text-gray-500 dark:text-gray-400">
                            <div>{companyName}</div>
                            <div>{companyAddress}</div>
                            <div>{companyEmail}</div>
                            <div>{companyPhone}</div>
                        </div>
                    </div>
                    <div className="lg:w-1/2 w-full lg:max-w-fit">
                        <div className="flex items-center">
                            <label htmlFor="number" className="flex-1 ltr:mr-2 rtl:ml-2 mb-0">
                                Invoice Number
                            </label>
                            <input id="number" type="text" name="inv-num" className="form-input lg:w-[250px] w-2/3" value={invoiceNumber} readOnly placeholder="Loading..." />
                        </div>
                        <div className="flex items-center mt-4">
                            <label htmlFor="invoiceLabel" className="flex-1 ltr:mr-2 rtl:ml-2 mb-0">
                                Invoice Label
                            </label>
                            <input id="invoiceLabel" type="text" name="inv-label" className="form-input lg:w-[250px] w-2/3" placeholder="Enter Invoice Label" />
                        </div>
                        <div className="flex items-center mt-4">
                            <label htmlFor="startDate" className="flex-1 ltr:mr-2 rtl:ml-2 mb-0">
                                Invoice Date
                            </label>
                            <input id="startDate" type="date" name="inv-date" className="form-input lg:w-[250px] w-2/3" value={today} readOnly />
                        </div>
                        <div className="flex items-center mt-4">
                            <label htmlFor="dueDate" className="flex-1 ltr:mr-2 rtl:ml-2 mb-0">
                                Due Date
                            </label>
                            <input id="dueDate" type="date" name="due-date" className="form-input lg:w-[250px] w-2/3" />
                        </div>
                    </div>
                </div>
                <hr className="border-white-light dark:border-[#1b2e4b] my-6" />
                <div className="mt-8 px-4">
                    <div className="flex justify-between lg:flex-row flex-col">
                        <div className="lg:w-1/2 w-full ltr:lg:mr-6 rtl:lg:ml-6 mb-6">
                            <div className="text-lg">Bill To :-</div>
                            <div className="mt-4 flex items-center">
                                <label htmlFor="reciever-name" className="ltr:mr-2 rtl:ml-2 w-1/3 mb-0">
                                    Name
                                </label>
                                <input id="reciever-name" type="text" name="reciever-name" className="form-input flex-1" placeholder="Enter Name" />
                            </div>
                            <div className="mt-4 flex items-center">
                                <label htmlFor="reciever-email" className="ltr:mr-2 rtl:ml-2 w-1/3 mb-0">
                                    Email
                                </label>
                                <input id="reciever-email" type="email" name="reciever-email" className="form-input flex-1" placeholder="Enter Email" />
                            </div>
                            <div className="mt-4 flex items-center">
                                <label htmlFor="reciever-address" className="ltr:mr-2 rtl:ml-2 w-1/3 mb-0">
                                    Address
                                </label>
                                <input id="reciever-address" type="text" name="reciever-address" className="form-input flex-1" placeholder="Enter Address" />
                            </div>
                            <div className="mt-4 flex items-center">
                                <label htmlFor="reciever-number" className="ltr:mr-2 rtl:ml-2 w-1/3 mb-0">
                                    Phone Number
                                </label>
                                <input id="reciever-number" type="text" name="reciever-number" className="form-input flex-1" placeholder="Enter Phone number" />
                            </div>
                        </div>
                        <div className="lg:w-1/2 w-full">
                            <div className="text-lg">Payment Details:</div>
                            <div className="flex items-center mt-4">
                                <label htmlFor="acno" className="ltr:mr-2 rtl:ml-2 w-1/3 mb-0">
                                    Account Number
                                </label>
                                <input id="acno" type="text" name="acno" className="form-input flex-1" placeholder="Enter Account Number" />
                            </div>
                            <div className="flex items-center mt-4">
                                <label htmlFor="bank-name" className="ltr:mr-2 rtl:ml-2 w-1/3 mb-0">
                                    Bank Name
                                </label>
                                <input id="bank-name" type="text" name="bank-name" className="form-input flex-1" placeholder="Enter Bank Name" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-8">
                    <div className="table-responsive">
                        <table>
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th className="w-1">Quantity</th>
                                    <th className="w-1">Price</th>
                                    <th>Total</th>
                                    <th className="w-1"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.length <= 0 && (
                                    <tr>
                                        <td colSpan={5} className="!text-center font-semibold">
                                            No Item Available
                                        </td>
                                    </tr>
                                )}
                                {items.map((item: any) => {
                                    return (
                                        <tr className="align-top" key={item.id}>
                                            <td>
                                                {/* Dropdown for item name */}
                                                <select
                                                    className="form-select min-w-[200px]"
                                                    value={item.selectedProductId ? item.selectedProductId.toString() : ''}
                                                    onChange={(e) => {
                                                        const selectedProduct = productList.find((product) => product.id === parseInt(e.target.value, 10));
                                                        if (selectedProduct) {
                                                            const updatedItems = items.map(
                                                                (
                                                                    i: any // 👈 Explicitly typing 'i' as 'any' (quick fix)
                                                                ) =>
                                                                    i.id === item.id
                                                                        ? {
                                                                              ...i,
                                                                              selectedProductId: selectedProduct.id,
                                                                              title: selectedProduct.name,
                                                                              description: selectedProduct.description,
                                                                              rate: selectedProduct.sellingPrice, // ✅ Ensure correct type
                                                                          }
                                                                        : i
                                                            );
                                                            setItems(updatedItems);
                                                        }
                                                    }}
                                                >
                                                    <option value="">Select Product</option>
                                                    {productList.length > 0 ? (
                                                        productList.map((product) => (
                                                            <option key={product.id} value={product.id.toString()}>
                                                                {product.name}
                                                            </option>
                                                        ))
                                                    ) : (
                                                        <option disabled>Loading...</option>
                                                    )}
                                                </select>

                                                {/* Description */}
                                                <textarea className="form-textarea mt-4" placeholder="Enter Description" value={item.description} readOnly></textarea>
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    className="form-input w-32"
                                                    placeholder="Quantity"
                                                    min={0}
                                                    value={item.quantity}
                                                    onChange={(e) => changeQuantityPrice('quantity', e.target.value, item.id)}
                                                />
                                            </td>
                                            <td>
                                                <input type="number" className="form-input w-32" placeholder="Price" min={0} value={item.rate} readOnly />
                                            </td>
                                            <td>Rs {item.quantity * item.rate}</td>
                                            <td>
                                                <button type="button" onClick={() => removeItem(item)}>
                                                    <IconX className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-between sm:flex-row flex-col mt-6 px-4">
                        <div className="sm:mb-0 mb-6">
                            <button type="button" className="btn btn-primary" onClick={() => addItem()}>
                                Add Item
                            </button>
                        </div>
                        <div className="sm:w-2/5">
                            <div className="flex items-center justify-between">
                                <div>Subtotal</div>
                                <div>Rs {subtotal.toFixed(2)}</div>
                            </div>
                            <div className="flex items-center justify-between mt-4">
                                <div>Discount(%)</div>
                                <input type="number" className="form-input w-16 text-right" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
                            </div>
                            <div className="flex items-center justify-between mt-4 font-semibold">
                                <div>Total</div>
                                <div>Rs {total.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-8 px-4">
                    <label htmlFor="notes">Notes</label>
                    <textarea id="notes" name="notes" className="form-textarea min-h-[130px]" placeholder="Notes...."></textarea>
                </div>
                <div className="p-4">
                    <button type="button" className="btn btn-success mt-8 w-full" onClick={handleSave}>
                        <IconSave className="shrink-0 mx-2" />
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Add;
