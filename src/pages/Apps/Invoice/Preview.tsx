import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useParams } from 'react-router-dom'; // Use for getting URL parameters
import { setPageTitle } from '../../../store/themeConfigSlice';
import IconSend from '../../../components/Icon/IconSend';
import IconDownload from '../../../components/Icon/IconDownload';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';
import { createClient } from '@supabase/supabase-js';

// ✅ Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const Preview = () => {
    const { id } = useParams(); // Retrieve the invoice ID from the URL
    const dispatch = useDispatch();
    const [invoice, setInvoice] = useState<any>(null); // State for invoice details
    const [loading, setLoading] = useState(true); // State for loading
    const panelRef = useRef<HTMLDivElement>(null);

    const [companyEmail, setCompanyEmail] = useState<string>('N/A');
    const [companyAddress, setCompanyAddress] = useState<string>('N/A');
    const [companyPhone, setCompanyPhone] = useState<string>('N/A');
    const [companyLogo, setCompanyLogo] = useState<string | null>(null);
    const [companyName, setCompanyName] = useState<string | null>(null);

    useEffect(() => {
        const fetchCompanyDetails = async () => {
            try {
                // ✅ Fetch authenticated user
                const { data: userData, error: userError } = await supabase.auth.getUser();
                if (userError || !userData?.user?.email) {
                    console.error('User not authenticated:', userError);
                    return;
                }
                const userEmail = userData.user.email;

                // ✅ Fetch company details based on authenticated user
                const { data, error } = await supabase.from('companies').select('company_email, address, phone_number, company_logo, company_username').eq('company_email', userEmail).single();

                if (error) {
                    console.error('Error fetching company details:', error);
                    return;
                }

                // ✅ Set the fetched data
                if (data) {
                    setCompanyEmail(data.company_email || 'N/A');
                    setCompanyAddress(data.address || 'N/A');
                    setCompanyPhone(data.phone_number || 'N/A');
                    setCompanyLogo(data.company_logo || null);
                    setCompanyName(data.company_username || 'N/A');
                }
            } catch (error) {
                console.error('Unexpected error fetching company data:', error);
            }
        };

        fetchCompanyDetails();
    }, []);

    useEffect(() => {
        dispatch(setPageTitle('Invoice Preview'));

        const fetchInvoice = async () => {
            try {
                // ✅ Fetch authenticated user
                const { data: userData, error: userError } = await supabase.auth.getUser();
                if (userError || !userData?.user?.email) {
                    console.error('User not authenticated:', userError);
                    return;
                }
                const userEmail = userData.user.email;

                // ✅ Fetch invoice only for the authenticated user's company
                const { data, error } = await supabase
                    .from('invoices')
                    .select('*')
                    .eq('id', id)
                    .eq('inv_company_email', userEmail) // Ensure the invoice belongs to the logged-in user's company
                    .single();

                if (error) {
                    console.error('Error fetching invoice:', error);
                    return;
                }

                setInvoice(data);
            } catch (error) {
                console.error('Unexpected error fetching invoice:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchInvoice();
    }, [id, dispatch]);

    const downloadModernInvoice = async () => {
        if (!invoice) {
            Swal.fire('Error', 'Invoice details are missing!', 'error');
            return;
        }

        const pdf = new jsPDF();

        Swal.fire({
            title: 'Generating PDF...',
            text: 'Please wait while we prepare your invoice.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            },
        });

        try {
            // ✅ Load company logo dynamically
            let imgData = companyLogo;
            if (!imgData) {
                imgData = '/assets/images/logo.svg'; // Default logo if none is found
            }

            // ✅ Add company logo (adjust size and position)
            if (imgData) {
                pdf.addImage(imgData, 'PNG', 10, 10, 30, 30);
            }

            // ✅ Invoice title
            pdf.setFontSize(30);
            pdf.setFont('Helvetica', 'bold');
            pdf.text('INVOICE', 80, 20);

            // ✅ Invoice number
            pdf.setFontSize(12);
            pdf.text(`NO. ${invoice.inv_num || 'N/A'}`, 160, 25, { align: 'right' });

            // ✅ Invoice Date & Due Date
            pdf.setFontSize(12);
            pdf.text(`Date: ${invoice.inv_date || 'N/A'}`, 10, 50);
            pdf.text(`Due Date: ${invoice.inv_due_date || 'N/A'}`, 150, 50);

            // ✅ Bill To and Company Info
            pdf.setFont('Helvetica', 'normal');
            pdf.text('Bill To:', 10, 65);
            pdf.text(invoice.inv_bill_name || 'N/A', 10, 70);
            pdf.text(invoice.inv_address || 'N/A', 10, 75);
            pdf.text(invoice.inv_email || 'N/A', 10, 80);
            pdf.text(invoice.inv_phone || 'N/A', 10, 85);

            pdf.text('From:', 120, 65);
            pdf.text(companyName || 'N/A', 120, 70);
            pdf.text(companyAddress || 'N/A', 120, 75);
            pdf.text(companyEmail || 'N/A', 120, 80);
            pdf.text(companyPhone || 'N/A', 120, 85);

            // ✅ Add Table Headers
            autoTable(pdf, {
                startY: 100,
                head: [['Item', 'Quantity', 'Price', 'Amount']],
                body: invoiceItems.map((item: any) => [item.title || 'N/A', item.quantity || 0, `Rs ${item.rate || 0}`, `Rs ${item.quantity * item.rate || 0}`]),
                theme: 'grid',
                headStyles: { fillColor: [240, 240, 240], textColor: 0 },
                bodyStyles: { textColor: 50 },
                alternateRowStyles: { fillColor: [245, 245, 245] },
            });

            // ✅ Position for totals
            const finalY = (pdf as any).lastAutoTable.finalY + 10;

            pdf.setFontSize(12);
            pdf.text(`Subtotal: Rs ${invoice.inv_subtotal || 0}`, 195, finalY, { align: 'right' });
            pdf.text(`Discount: ${invoice.inv_discount || 0}%`, 195, finalY + 10, { align: 'right' });
            pdf.setFontSize(14);
            pdf.setFont('Helvetica', 'bold');
            pdf.text(`Grand Total: Rs ${invoice.inv_total || 0}`, 195, finalY + 20, { align: 'right' });

            // ✅ Add Notes
            if (invoice.inv_notes) {
                pdf.setFontSize(12);
                pdf.setFont('Helvetica', 'italic');
                pdf.text(`Note: ${invoice.inv_notes || 'Thanks for your purchase'}`, 10, finalY + 40);
            }

            // ✅ Save the PDF
            pdf.save(`Invoice_${invoice.inv_num || 'Preview'}.pdf`);
            Swal.close();
        } catch (error) {
            console.error('Error generating PDF:', error);
            Swal.fire('Error', 'Failed to generate PDF. Please try again.', 'error');
        }
    };

    const handleSendEmail = () => {
        const recipientEmail = invoice?.inv_email;
        if (!recipientEmail) {
            Swal.fire('Error', 'Recipient email not found!', 'error');
            return;
        }
        // Simulate email sending (Replace with actual email API)
        Swal.fire('Success', `Invoice sent to ${recipientEmail} via Email.`, 'success');
    };

    const handleSendWhatsApp = () => {
        const phone = invoice?.inv_phone?.replace(/\D/g, ''); // Remove non-numeric characters
        if (!phone) {
            Swal.fire('Error', 'Recipient phone number not found!', 'error');
            return;
        }
        const message = `Hello, here is your invoice: ${invoice?.inv_num}`;
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        // Open WhatsApp link
        window.open(url, '_blank');
    };

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!invoice) {
        return <div>Invoice not found.</div>;
    }

    // Parse `inv_items` safely, with a fallback to an empty array
    const invoiceItems = (() => {
        try {
            return JSON.parse(invoice.inv_items) || [];
        } catch {
            return [];
        }
    })();

    return (
        <div>
            <div className="flex items-center lg:justify-end justify-center flex-wrap gap-4 mb-6">
                <button type="button" className="btn btn-success gap-2" onClick={downloadModernInvoice}>
                    <IconDownload />
                    Download
                </button>
            </div>
            <div className="panel" ref={panelRef}>
                <div className="flex justify-between flex-wrap gap-4 px-4">
                    <div className="text-2xl font-semibold uppercase">{invoice.inv_label || 'N/A'}</div>
                    <div className="flex items-center text-black dark:text-white shrink-0">
                        {companyLogo ? <img src={companyLogo} alt="Company Logo" className="w-14" /> : <img src="/assets/images/logo.svg" alt="Default Logo" className="w-14" />}
                    </div>
                </div>
                <div className="ltr:text-right rtl:text-left px-4">
                    <div className="space-y-1 mt-6 text-white-dark">
                        <div>{companyName}</div>
                        <div>{companyEmail}</div>
                        <div>{companyAddress}</div>
                        <div>{companyPhone}</div>
                    </div>
                </div>

                <hr className="border-white-light dark:border-[#1b2e4b] my-6" />
                <div className="flex justify-between lg:flex-row flex-col gap-6 flex-wrap">
                    <div className="flex-1">
                        <div className="space-y-1 text-white-dark">
                            <div>Issue For:</div>
                            <div className="text-black dark:text-white font-semibold">{invoice.inv_bill_name || 'N/A'}</div>
                            <div>{invoice.inv_address || 'N/A'}</div>
                            <div>{invoice.inv_email || 'N/A'}</div>
                            <div>{invoice.inv_phone || 'N/A'}</div>
                        </div>
                    </div>
                    <div className="flex justify-between sm:flex-row flex-col gap-6 lg:w-2/3">
                        <div className="xl:1/3 lg:w-2/5 sm:w-1/2">
                            <div className="flex items-center w-full justify-between mb-2">
                                <div className="text-white-dark">Invoice :</div>
                                <div>{invoice.inv_num}</div>
                            </div>
                            <div className="flex items-center w-full justify-between mb-2">
                                <div className="text-white-dark">Issue Date :</div>
                                <div>{invoice.inv_date}</div>
                            </div>
                            <div className="flex items-center w-full justify-between mb-2">
                                <div className="text-white-dark">Due Date :</div>
                                <div>{invoice.inv_due_date}</div>
                            </div>
                        </div>
                        <div className="xl:1/3 lg:w-2/5 sm:w-1/2">
                            <div className="flex items-center w-full justify-between mb-2">
                                <div className="text-white-dark">Bank Name:</div>
                                <div className="whitespace-nowrap">{invoice.inv_bank_name || 'N/A'}</div>
                            </div>
                            <div className="flex items-center w-full justify-between mb-2">
                                <div className="text-white-dark">Account Number:</div>
                                <div>{invoice.inv_acc_num || 'N/A'}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="table-responsive mt-6">
                    <table className="table-striped">
                        <thead>
                            <tr>
                                <th>No.</th>
                                <th>ITEMS</th>
                                <th>QTY</th>
                                <th className="ltr:text-right rtl:text-left">PRICE</th>
                                <th className="ltr:text-right rtl:text-left">AMOUNT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoiceItems.map((item: any, index: number) => (
                                <tr key={index}>
                                    <td>{index + 1}</td>
                                    <td>{item.title || 'N/A'}</td>
                                    <td>{item.quantity || 0}</td>
                                    <td className="ltr:text-right rtl:text-left">Rs {item.rate || 0}</td>
                                    <td className="ltr:text-right rtl:text-left">Rs {item.quantity * item.rate || 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="grid sm:grid-cols-2 grid-cols-1 px-4 mt-6">
                    <div></div>
                    <div className="ltr:text-right rtl:text-left space-y-2">
                        <div className="flex items-center">
                            <div className="flex-1">Subtotal</div>
                            <div className="w-[37%]">Rs {invoice.inv_subtotal || 0}</div>
                        </div>
                        <div className="flex items-center">
                            <div className="flex-1">Discount</div>
                            <div className="w-[37%]">{invoice.inv_discount || 0}%</div>
                        </div>
                        <div className="flex items-center font-semibold text-lg">
                            <div className="flex-1">Grand Total</div>
                            <div className="w-[37%]">Rs {invoice.inv_total || 0}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Preview;
