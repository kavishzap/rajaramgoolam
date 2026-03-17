import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { createClient } from '@supabase/supabase-js';
import { setPageTitle } from '../../store/themeConfigSlice';

const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface ExpenseLineItem {
    id: number;
    title: string;
    description: string;
    rate: number;
    quantity: number;
    amount: number;
}

const ExpensesAdd = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    useEffect(() => {
        dispatch(setPageTitle('Add Expense'));
    }, [dispatch]);

    const today = new Date().toISOString().split('T')[0];

    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [expenseDate, setExpenseDate] = useState<string>(today);
    const [note, setNote] = useState<string>('');

    const [items, setItems] = useState<ExpenseLineItem[]>([
        {
            id: 1,
            title: '',
            description: '',
            rate: 0,
            quantity: 0,
            amount: 0,
        },
    ]);

    const [subtotal, setSubtotal] = useState<number>(0);
    const [total, setTotal] = useState<number>(0);

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
        const calcSubtotal = items.reduce((sum, item) => sum + item.amount, 0);
        setSubtotal(calcSubtotal);
        setTotal(calcSubtotal);
    }, [items]);

    const updateItemField = (id: number, field: keyof ExpenseLineItem, value: string) => {
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;
                const updated: ExpenseLineItem = {
                    ...item,
                    [field]:
                        field === 'rate' || field === 'quantity'
                            ? Number(value) || 0
                            : value,
                } as ExpenseLineItem;
                if (field === 'rate' || field === 'quantity') {
                    const rate = field === 'rate' ? Number(value) || 0 : updated.rate;
                    const qty = field === 'quantity' ? Number(value) || 0 : updated.quantity;
                    updated.amount = rate * qty;
                }
                return updated;
            }),
        );
    };

    const addLine = () => {
        setItems((prev) => [
            ...prev,
            {
                id: prev.length ? Math.max(...prev.map((p) => p.id)) + 1 : 1,
                title: '',
                description: '',
                rate: 0,
                quantity: 0,
                amount: 0,
            },
        ]);
    };

    const removeLine = (id: number) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
    };

    const handleSave = async () => {
        if (!userEmail) {
            Swal.fire('Error', 'No authenticated user found. Please log in.', 'error');
            return;
        }

        const missing: string[] = [];
        if (!expenseDate) missing.push('Date');
        if (!note.trim()) missing.push('Note');

        const validItems = items.filter((item) => item.title.trim() && item.quantity > 0 && item.rate > 0);
        if (!validItems.length) {
            missing.push('At least one line item with title, rate and quantity');
        }

        if (missing.length) {
            Swal.fire({
                icon: 'warning',
                title: 'Missing Fields',
                html: `<div class="text-left">Please fill the following fields:<br/><strong>${missing.join(
                    ', ',
                )}</strong></div>`,
            });
            return;
        }

        const expenseItemsRecord: Record<string, string> = {};
        validItems.forEach((item) => {
            const key = item.title.trim();
            const amount = item.amount || item.rate * item.quantity;
            if (key) {
                // Store amount plus qty & rate so exports can show quantity
                expenseItemsRecord[key] = `${amount.toFixed(2)} (Qty: ${item.quantity}, Rate: ${item.rate.toFixed(2)})`;
            }
        });

        const payload = {
            expense_company_email: userEmail,
            expense_date: expenseDate,
            expense_note: note.trim(),
            expense_items: expenseItemsRecord,
            expense_total: total.toFixed(2),
            expense_image_base64: null,
        };

        try {
            Swal.fire({
                title: 'Saving expense...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading(),
            });

            const { error } = await supabase.from('expenses').insert([payload]);
            Swal.close();

            if (error) throw error;

            Swal.fire({
                icon: 'success',
                title: 'Expense Saved',
                text: 'Your expense has been saved successfully!',
            }).then(() => {
                navigate('/expenses');
            });
        } catch (error) {
            console.error('Error saving expense:', error);
            Swal.fire('Error', 'Failed to save the expense. Please try again.', 'error');
        }
    };

    return (
        <div className="panel">
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold">Add New Expense</h2>
                <div className="flex gap-3">
                    <Link to="/expenses" className="btn btn-outline-secondary">
                        Cancel
                    </Link>
                    <button type="button" className="btn btn-primary" onClick={handleSave}>
                        Save Expense
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                <div>
                    <label className="form-label">Expense Date</label>
                    <input
                        type="date"
                        className="form-input"
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                    />
                </div>
                <div>
                    <label className="form-label">Note</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Short description"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                </div>
            </div>

            <div className="mt-4">
                <h3 className="text-lg font-semibold mb-3">Line Items</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800">
                                <th className="px-3 py-2 border">Title</th>
                                <th className="px-3 py-2 border">Description</th>
                                <th className="px-3 py-2 border text-right">Rate</th>
                                <th className="px-3 py-2 border text-right">Qty</th>
                                <th className="px-3 py-2 border text-right">Amount</th>
                                <th className="px-3 py-2 border text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => (
                                <tr key={item.id}>
                                    <td className="px-3 py-2 border">
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={item.title}
                                            onChange={(e) => updateItemField(item.id, 'title', e.target.value)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 border">
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={item.description}
                                            onChange={(e) => updateItemField(item.id, 'description', e.target.value)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 border text-right">
                                        <input
                                            type="number"
                                            className="form-input text-right"
                                            value={item.rate || ''}
                                            onChange={(e) => updateItemField(item.id, 'rate', e.target.value)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 border text-right">
                                        <input
                                            type="number"
                                            className="form-input text-right"
                                            value={item.quantity || ''}
                                            onChange={(e) => updateItemField(item.id, 'quantity', e.target.value)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 border text-right">
                                        Rs {item.amount.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2 border text-center">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-danger"
                                            onClick={() => removeLine(item.id)}
                                            disabled={items.length === 1}
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-3 flex justify-between items-center">
                    <button type="button" className="btn btn-outline-primary" onClick={addLine}>
                        Add Line
                    </button>
                    <div className="text-right space-y-1">
                        <div>Subtotal: Rs {subtotal.toFixed(2)}</div>
                        <div className="font-semibold">Total: Rs {total.toFixed(2)}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExpensesAdd;

