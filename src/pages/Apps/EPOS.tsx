import { useState, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { setPageTitle } from '../../store/themeConfigSlice';
import IconSearch from '../../components/Icon/IconSearch';
import IconX from '../../components/Icon/IconX';
import IconPlus from '../../components/Icon/IconPlus';
import IconMinus from '../../components/Icon/IconMinus';
import Swal from 'sweetalert2';
import { createClient } from '@supabase/supabase-js';
import { printOrderReceipt } from '../../utils/thermalPrintingUtils';

const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Product {
    id: number;
    name: string;
    description: string;
    sellingPrice: number;
    manufacturingPrice: number;
    code: string;
    category: string;
    stock: number;
    image: string | null;
}

interface CartItem {
    product: Product;
    quantity: number;
}

const EPOS = () => {
    const dispatch = useDispatch();
    useEffect(() => {
        dispatch(setPageTitle('EPOS'));
    }, [dispatch]);

    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [categories, setCategories] = useState<string[]>([]);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [productPage, setProductPage] = useState(1);
    const productsPerPage = 16;
    const [vatPercent, setVatPercent] = useState<number>(0);
    const [companyName, setCompanyName] = useState<string | null>(null);
    const [companyBrn, setCompanyBrn] = useState<string | null>(null);
    const [companyVat, setCompanyVat] = useState<string | null>(null);
    const [companyLogo, setCompanyLogo] = useState<string | null>(null);

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

    // Fetch categories
    const fetchCategories = useCallback(async () => {
        if (!userEmail) return;
        try {
            const { data, error } = await supabase
                .from('categories')
                .select('category_name')
                .eq('category_company_email', userEmail);

            if (error) throw error;
            const categoryNames = data.map((cat: any) => cat.category_name);
            setCategories(categoryNames);
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    }, [userEmail]);

    // Fetch products
    const fetchProducts = useCallback(async () => {
        if (!userEmail) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('products')
                .select('id, product_name, product_description, product_selling_price, product_manufacturing_price, product_code, product_category, product_qty, product_image')
                .eq('product_company_email', userEmail);

            if (error) throw error;

            const formattedData = data.map((item: any) => ({
                id: Number(item.id),
                name: item.product_name,
                description: item.product_description || '',
                sellingPrice: parseFloat(item.product_selling_price) || 0,
                manufacturingPrice: parseFloat(item.product_manufacturing_price) || 0,
                code: item.product_code,
                category: item.product_category,
                stock: parseInt(item.product_qty, 10) || 0,
                image: item.product_image,
            }));

            setProducts(formattedData);
            setFilteredProducts(formattedData);
        } catch (error) {
            console.error('Error fetching products:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to fetch products. Please try again later.',
                confirmButtonText: 'OK',
            });
        } finally {
            setLoading(false);
        }
    }, [userEmail]);

    useEffect(() => {
        fetchUser();
    }, []);

    const fetchCompanyDetails = useCallback(async () => {
        if (!userEmail) return;
        try {
            const { data, error } = await supabase
                .from('companies')
                .select('company_username, brn, vat, company_logo')
                .eq('company_email', userEmail)
                .single();

            if (error) {
                console.error('Error fetching company details:', error);
                return;
            }

            if (data) {
                setCompanyName(data.company_username || null);
                setCompanyBrn(data.brn || null);
                setCompanyVat(data.vat || null);
                setCompanyLogo(data.company_logo || null);
            }
        } catch (err) {
            console.error('Unexpected error fetching company details:', err);
        }
    }, [userEmail]);

    useEffect(() => {
        if (userEmail) {
            fetchProducts();
            fetchCategories();
            fetchCompanyDetails();
        }
    }, [userEmail, fetchProducts, fetchCategories, fetchCompanyDetails]);

    // Filter products
    useEffect(() => {
        let filtered = products;

        if (search) {
            filtered = filtered.filter(
                (p) =>
                    p.name.toLowerCase().includes(search.toLowerCase()) ||
                    p.code.toLowerCase().includes(search.toLowerCase())
            );
        }

        if (selectedCategory) {
            filtered = filtered.filter((p) => p.category === selectedCategory);
        }

        setFilteredProducts(filtered);
        setProductPage(1);
    }, [search, selectedCategory, products]);

    const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
    const paginatedProducts = filteredProducts.slice(
        (productPage - 1) * productsPerPage,
        productPage * productsPerPage
    );

    // Add to cart
    const addToCart = (product: Product) => {
        if (product.stock <= 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Out of Stock',
                text: 'This product is currently out of stock.',
                confirmButtonText: 'OK',
            });
            return;
        }

        setCart((prevCart) => {
            const existingItem = prevCart.find((item) => item.product.id === product.id);
            if (existingItem) {
                if (existingItem.quantity >= product.stock) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Stock Limit',
                        text: `Only ${product.stock} units available in stock.`,
                        confirmButtonText: 'OK',
                    });
                    return prevCart;
                }
                return prevCart.map((item) =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prevCart, { product, quantity: 1 }];
        });
    };

    // Update quantity
    const updateQuantity = (productId: number, delta: number) => {
        setCart((prevCart) => {
            return prevCart
                .map((item) => {
                    if (item.product.id === productId) {
                        const newQuantity = item.quantity + delta;
                        if (newQuantity <= 0) return null;
                        if (newQuantity > item.product.stock) {
                            Swal.fire({
                                icon: 'warning',
                                title: 'Stock Limit',
                                text: `Only ${item.product.stock} units available in stock.`,
                                confirmButtonText: 'OK',
                            });
                            return item;
                        }
                        return { ...item, quantity: newQuantity };
                    }
                    return item;
                })
                .filter((item): item is CartItem => item !== null);
        });
    };

    // Remove from cart
    const removeFromCart = (productId: number) => {
        setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));
    };

    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0);
    const totalProfit = cart.reduce(
        (sum, item) =>
            sum +
            (item.product.sellingPrice - item.product.manufacturingPrice) * item.quantity,
        0,
    );
    const safeVat = !Number.isFinite(vatPercent) || vatPercent < 0 ? 0 : vatPercent;
    const vatAmount = subtotal * (safeVat / 100);
    const grandTotal = subtotal + vatAmount;

    const printReceiptHtml = (params: {
        items: { name: string; quantity: number; price: number; code: string }[];
        subtotal: number;
        vatPercent: number;
        vatAmount: number;
        grandTotal: number;
        companyEmail: string | null;
        orderDate: string;
        companyName?: string | null;
        brn?: string | null;
        vatNumber?: string | null;
        companyLogo?: string | null;
    }) => {
        const {
            items,
            subtotal,
            vatPercent,
            vatAmount,
            grandTotal,
            companyEmail,
            orderDate,
            companyName,
            brn,
            vatNumber,
            companyLogo,
        } = params;

        const W = 42;
        const pad = (s: string, n: number, right = false) => {
            const t = String(s).slice(0, n);
            return right ? t.padStart(n) : t.padEnd(n);
        };
        const line = () => '-'.repeat(W);
        const center = (s: string) => {
            const t = String(s).slice(0, W);
            const padLen = Math.max(0, Math.floor((W - t.length) / 2));
            return ' '.repeat(padLen) + t;
        };
        const row = (left: string, right: string) => {
            const r = String(right);
            const l = String(left).slice(0, W - r.length - 1);
            return pad(l, W - r.length) + r;
        };

        const headerLines: string[] = ['Sales Receipt'];
        const displayName = companyName || companyEmail;
        if (displayName) headerLines.push(displayName);
        if (brn) headerLines.push(`BRN: ${brn}`);
        if (vatNumber) headerLines.push(`VAT: ${vatNumber}`);

        const lines: string[] = [
            '',
            ...headerLines.map((h) => center(h)),
            center(`Date: ${orderDate}`),
            line(),
            ...items.map((item) => row(`${item.quantity} x ${item.name}`, `Rs ${(item.price * item.quantity).toFixed(2)}`)),
            line(),
            row('Subtotal', `Rs ${subtotal.toFixed(2)}`),
            row(`VAT (${vatPercent.toFixed(2)}%)`, `Rs ${vatAmount.toFixed(2)}`),
            row('Grand Total', `Rs ${grandTotal.toFixed(2)}`),
            line(),
            center('Thank you for your purchase!'),
            '',
            ...Array(6).fill(''),
        ];

        const receiptText = lines.join('\n');

        const logoSrc =
            companyLogo && companyLogo.trim()
                ? companyLogo.trim().startsWith('data:')
                    ? companyLogo.trim()
                    : `data:image/png;base64,${companyLogo.trim()}`
                : '';

        const printWindow = window.open('', '_blank', 'width=400,height=500');
        if (!printWindow) {
            console.error('Unable to open print window.');
            return;
        }

        const receiptHtml = `
            <html>
                <head>
                    <title>Receipt</title>
                    <style>
                        * { box-sizing: border-box; margin: 0; padding: 0; }
                        body {
                            font-family: "Courier New", monospace;
                            font-size: 12px;
                            line-height: 1.3;
                            padding: 10px;
                            white-space: pre;
                        }
                        .receipt {
                            width: 80mm;
                            max-width: 280px;
                            margin: 0 auto;
                        }
                        .print-hint {
                            font-family: Arial, sans-serif;
                            font-size: 10px;
                            color: #666;
                            margin-bottom: 8px;
                            white-space: normal;
                            text-align: center;
                        }
                        .logo {
                            display: block;
                            margin: 0 auto 4px;
                            max-width: 60px;
                            max-height: 60px;
                        }
                        .receipt-bottom-space {
                            display: block;
                            height: 10px;
                            min-height: 10px;
                        }
                        @media print {
                            @page { size: 80mm auto; margin: 0; }
                            body { padding: 0; }
                            .print-hint { display: none !important; }
                            .receipt-bottom-space { height: 10mm; min-height: 10mm; }
                        }
                    </style>
                </head>
                <body onload="window.print(); window.close();">
                    <div class="print-hint">Set layout to <strong>Portrait</strong> for receipt printer.</div>
                    <div class="receipt">
                        ${logoSrc ? `<img class="logo" src="${logoSrc.replace(/"/g, '&quot;')}" alt="Company Logo" />` : ''}
                        <pre>${receiptText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                        <div class="receipt-bottom-space"></div>
                    </div>
                </body>
            </html>
        `;

        printWindow.document.open();
        printWindow.document.write(receiptHtml);
        printWindow.document.close();
    };

    // Create order
    const createOrder = async () => {
        if (cart.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Empty Cart',
                text: 'Please add products to cart before creating an order.',
                confirmButtonText: 'OK',
            });
            return;
        }

        if (!userEmail) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'User not authenticated. Please login again.',
                confirmButtonText: 'OK',
            });
            return;
        }

        // Show confirmation dialog
        const confirmation = await Swal.fire({
            icon: 'question',
            title: 'Confirm Order',
            html: `
                <div class="text-left">
                    <p class="mb-2"><strong>Order Summary:</strong></p>
                    <p class="mb-1">Items: ${cart.length}</p>
                    <p class="mb-1">Subtotal: <strong>Rs ${subtotal.toFixed(2)}</strong></p>
                    <p class="mb-1">VAT (${safeVat.toFixed(2)}%): <strong>Rs ${vatAmount.toFixed(2)}</strong></p>
                    <p class="mb-3 mt-2"><strong>Grand Total: Rs ${grandTotal.toFixed(2)}</strong></p>
                    <p>Do you want to create this order?</p>
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, Create Order',
            cancelButtonText: 'Cancel',
            reverseButtons: true,
        });

        // If user cancels, don't proceed
        if (!confirmation.isConfirmed) {
            return;
        }

        try {
            // Calculate profit (selling price - manufacturing price)
            const orderItems = cart.map((item) => ({
                name: item.product.name,
                quantity: item.quantity,
                price: item.product.sellingPrice,
                code: item.product.code,
            }));

            // Calculate total profit from cart
            const orderProfit = totalProfit;

            const orderDate = new Date().toISOString().split('T')[0];

            const orderData = {
                order_company_email: userEmail,
                order_date: orderDate,
                order_items: orderItems,
                order_total: grandTotal.toFixed(2),
                order_profit: orderProfit.toFixed(2),
                status: true, // Completed
                phone: '',
                table: '',
            };

            const { error } = await supabase.from('orders').insert([orderData]);

            if (error) throw error;

            try {
                await printOrderReceipt({
                    items: orderItems,
                    subtotal,
                    vatPercent: safeVat,
                    vatAmount,
                    grandTotal,
                    companyLabel: userEmail,
                    companyName,
                    brn: companyBrn || undefined,
                    vatNumber: companyVat || undefined,
                    orderDate,
                    paperWidth: 32,
                    logo: companyLogo || undefined,
                });
            } catch (printError) {
                console.error('Thermal printer failed, falling back to browser print:', printError);
                printReceiptHtml({
                    items: orderItems,
                    subtotal,
                    vatPercent: safeVat,
                    vatAmount,
                    grandTotal,
                    companyEmail: userEmail,
                    orderDate,
                    companyName,
                    brn: companyBrn || undefined,
                    vatNumber: companyVat || undefined,
                    companyLogo,
                });
            }

            Swal.fire({
                icon: 'success',
                title: 'Order Created',
                text: 'Your order has been created successfully!',
                confirmButtonText: 'OK',
            }).then(() => {
                setCart([]);
                fetchProducts(); // Refresh products to update stock
            });
        } catch (error) {
            console.error('Error creating order:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to create order. Please try again.',
                confirmButtonText: 'OK',
            });
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Products Section */}
            <div className="lg:col-span-2">
                <div className="panel">
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-5 gap-4">
                        <h2 className="text-xl font-semibold">Products</h2>
                        <div className="flex flex-1 max-w-md gap-3">
                            {/* Category Filter */}
                            <select
                                className="form-select flex-1"
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                            >
                                <option value="">All Categories</option>
                                {categories.map((cat) => (
                                    <option key={cat} value={cat}>
                                        {cat}
                                    </option>
                                ))}
                            </select>
                            {/* Search */}
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    className="form-input ltr:pl-9 rtl:pr-9"
                                    placeholder="Search products..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                                <IconSearch className="absolute ltr:left-2.5 rtl:right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-10">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <p className="mt-2 text-gray-500">Loading products...</p>
                        </div>
                    ) : (
                        <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {paginatedProducts.map((product) => (
                                <div
                                    key={product.id}
                                    className={`border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${
                                        product.stock <= 0 ? 'opacity-50' : ''
                                    }`}
                                    onClick={() => addToCart(product)}
                                >
                                    {product.image ? (
                                        <img
                                            src={product.image.startsWith('data:') ? product.image : `data:image/jpeg;base64,${product.image}`}
                                            alt={product.name}
                                            className="w-full h-24 object-cover rounded mb-2"
                                        />
                                    ) : (
                                        <div className="w-full h-24 bg-gray-200 rounded mb-2 flex items-center justify-center">
                                            <span className="text-gray-400 text-xs">No Image</span>
                                        </div>
                                    )}
                                    <h3 className="font-semibold text-sm mb-1 truncate">{product.name}</h3>
                                    <p className="text-primary font-bold text-sm">Rs {product.sellingPrice.toFixed(2)}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Stock: {product.stock} | {product.code}
                                    </p>
                                </div>
                            ))}
                            {filteredProducts.length === 0 && (
                                <div className="col-span-full text-center py-10 text-gray-500">
                                    No products found
                                </div>
                            )}
                        </div>
                        {filteredProducts.length > productsPerPage && (
                            <div className="flex justify-between items-center mt-4">
                                <button
                                    type="button"
                                    className={`btn btn-sm ${productPage === 1 ? 'btn-outline-dark cursor-not-allowed opacity-50' : 'btn-outline-primary'}`}
                                    disabled={productPage === 1}
                                    onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                                >
                                    Previous
                                </button>
                                <span className="text-sm text-gray-600">
                                    Page {productPage} of {totalProductPages}
                                </span>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${productPage === totalProductPages ? 'btn-outline-dark cursor-not-allowed opacity-50' : 'btn-outline-primary'}`}
                                    disabled={productPage === totalProductPages}
                                    onClick={() => setProductPage((p) => Math.min(totalProductPages, p + 1))}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                        </>
                    )}
                </div>
            </div>

            {/* Cart Section */}
            <div className="lg:col-span-1">
                <div className="panel sticky top-6">
                    <h2 className="text-xl font-semibold mb-5">Cart</h2>

                    {cart.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            <p>Your cart is empty</p>
                            <p className="text-sm mt-2">Add products to get started</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                {cart.map((item) => (
                                    <div key={item.product.id} className="border rounded-lg p-3">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-sm">{item.product.name}</h4>
                                                <p className="text-primary font-bold text-sm">
                                                    Rs {item.product.sellingPrice.toFixed(2)}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeFromCart(item.product.id)}
                                                className="text-danger hover:text-danger-dark"
                                            >
                                                <IconX className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => updateQuantity(item.product.id, -1)}
                                                    className="btn btn-sm btn-outline-primary p-1"
                                                >
                                                    <IconMinus className="w-3 h-3" />
                                                </button>
                                                <span className="font-semibold w-8 text-center">{item.quantity}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => updateQuantity(item.product.id, 1)}
                                                    className="btn btn-sm btn-outline-primary p-1"
                                                >
                                                    <IconPlus className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <span className="font-bold">
                                                Rs {(item.product.sellingPrice * item.quantity).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t pt-4 mt-4 space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="font-semibold">Subtotal:</span>
                                    <span className="font-semibold">Rs {subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm gap-2">
                                    <label htmlFor="vatPercent" className="font-semibold">
                                        VAT (%):
                                    </label>
                                    <input
                                        id="vatPercent"
                                        type="number"
                                        className="form-input w-24 text-right"
                                        value={vatPercent}
                                        min={0}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            setVatPercent(Number.isNaN(v) ? 0 : v);
                                        }}
                                    />
                                    <span className="font-semibold">
                                        Rs {vatAmount.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-lg">
                                    <span className="font-bold">Grand Total:</span>
                                    <span className="font-bold text-primary">Rs {grandTotal.toFixed(2)}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={createOrder}
                                    className="btn btn-primary w-full mt-4"
                                >
                                    Create Order
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EPOS;

