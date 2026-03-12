import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import CashIcon from '../../../components/Icon/IconCashBanknotes';
import CashIcon2 from '../../../components/Icon/IconShoppingCart';

// (TS augmentation for autoTable, if you need it)
declare module 'jspdf' {
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
    }
}

// ✅ Supabase
const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helpers
const PAGE_SIZE = 1000;

function parseAmount(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let s = String(value).trim();
    if (!s) return 0;
    if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
    else if (s.includes(',') && !s.includes('.')) {
        const i = s.lastIndexOf(',');
        s = s.slice(0, i).replace(/,/g, '') + '.' + s.slice(i + 1);
    }
    s = s.replace(/[^0-9.-]/g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
}

function toMoney(n: number): string {
    return `Rs ${n.toFixed(2)}`;
}

function ymd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function fetchAll<T = any>({
    table,
    select,
    filters,
    orderBy = 'id',
    ascending = false,
}: {
    table: string;
    select: string;
    filters: (q: any) => any;
    orderBy?: string;
    ascending?: boolean;
}): Promise<T[]> {
    const all: T[] = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        let q = supabase
            .from(table)
            .select(select)
            .order(orderBy, { ascending })
            .range(from, from + PAGE_SIZE - 1);
        q = filters(q);
        const { data, error } = await q;
        if (error) throw error;
        const chunk = (data ?? []) as T[];
        if (chunk.length === 0) break;
        all.push(...chunk);
        if (chunk.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return all;
}

const Reports: React.FC = () => {
    const [data, setData] = useState<any[]>([]);
    const [filterType, setFilterType] = useState<'daily' | 'monthly' | 'yearly' | 'custom'>('monthly');
    const [startDate, setStartDate] = useState<string>(''); // yyyy-MM-dd
    const [endDate, setEndDate] = useState<string>(''); // yyyy-MM-dd
    const [loading, setLoading] = useState<boolean>(false);
    const [totalProfit, setTotalProfit] = useState<number>(0);
    const [totalSales, setTotalSales] = useState<number>(0);

    const computeRange = useCallback((): { fromYMD: string; toYMD: string; label: string } => {
        const now = new Date();
        let from = new Date(),
            to = new Date(),
            label = '';
        if (filterType === 'daily') {
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            label = format(from, 'dd MMM yyyy');
        } else if (filterType === 'monthly') {
            from = new Date(now.getFullYear(), now.getMonth(), 1);
            to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            label = format(from, 'MMM yyyy');
        } else if (filterType === 'yearly') {
            from = new Date(now.getFullYear(), 0, 1);
            to = new Date(now.getFullYear(), 11, 31);
            label = String(now.getFullYear());
        } else {
            // custom
            from = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
            to = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
            label = `${startDate || format(from, 'yyyy-MM-dd')} to ${endDate || format(to, 'yyyy-MM-dd')}`;
        }
        return { fromYMD: ymd(from), toYMD: ymd(to), label };
    }, [filterType, startDate, endDate]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData?.user?.email) {
                console.error('User not authenticated:', authError);
                setData([]);
                setTotalProfit(0);
                setTotalSales(0);
                return;
            }
            const userEmail = authData.user.email;
            const { fromYMD, toYMD } = computeRange();

            // Orders (chunked)
            const orders = await fetchAll<any>({
                table: 'orders',
                select: 'id, order_date, order_total, order_profit, order_company_email',
                orderBy: 'id',
                ascending: false,
                filters: (q) => q.eq('order_company_email', userEmail).gte('order_date', fromYMD).lte('order_date', toYMD),
            });

            // Invoices (chunked)
            const invoices = await fetchAll<any>({
                table: 'invoices',
                select: 'id, inv_date, inv_total, inv_profit, inv_company_email',
                orderBy: 'id',
                ascending: false,
                filters: (q) => q.eq('inv_company_email', userEmail).gte('inv_date', fromYMD).lte('inv_date', toYMD),
            });

            // Merge for display/export
            const allData = [
                ...orders.map((o) => ({
                    type: 'Order',
                    id: o.id,
                    date: o.order_date,
                    total: parseAmount(o.order_total),
                    profit: parseAmount(o.order_profit),
                })),
                ...invoices.map((i) => ({
                    type: 'Invoice',
                    id: i.id,
                    date: i.inv_date,
                    total: parseAmount(i.inv_total),
                    profit: parseAmount(i.inv_profit),
                })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const totals = allData.reduce(
                (acc, x) => {
                    acc.sales += x.total;
                    acc.profit += x.profit;
                    return acc;
                },
                { sales: 0, profit: 0 }
            );

            setData(allData);
            setTotalSales(totals.sales);
            setTotalProfit(totals.profit);
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    }, [computeRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData, filterType, startDate, endDate]);

    // ✅ Pretty PDF export
    const exportToPDF = async () => {
        const { label } = computeRange();
        const userEmail = (await supabase.auth.getUser()).data?.user?.email;
        if (!userEmail) return;

        const { data: companyData } = await supabase
            .from('companies')
            .select('company_username, address, phone_number')
            .eq('company_email', userEmail)
            .single();

        const companyName = companyData?.company_username || '';
        const companyAddress = companyData?.address || '';
        const companyPhone = companyData?.phone_number || '';

        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        const w = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();

        // Header band
        doc.setFillColor(13, 131, 144); // teal-ish
        doc.rect(0, 0, w, 70, 'F');

        // Title + meta
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Sales Report', 40, 42);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Period: ${label}`, 40, 60);
        const generated = format(new Date(), 'dd MMM yyyy, HH:mm');
        doc.text(`Generated: ${generated}`, w - 40, 60, { align: 'right' });

        // Company details + KPIs
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

        const startY = contentStartY;
        doc.setTextColor(40, 40, 40);
        doc.setFontSize(12);

        const kpiW = (w - 80 - 20) / 2; // two cards, 20px gap, 40px margins
        const kpiH = 60;

        // Card backgrounds
        doc.setDrawColor(230);
        doc.setFillColor(248, 248, 248);
        doc.roundedRect(40, startY, kpiW, kpiH, 8, 8, 'FD');
        doc.roundedRect(40 + kpiW + 20, startY, kpiW, kpiH, 8, 8, 'FD');

        // Labels
        doc.setFont('helvetica', 'bold');
        doc.text('Total Sales', 55, startY + 22);
        doc.text('Total Profit', 55 + kpiW + 20, startY + 22);

        // Values
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(16);
        doc.text(toMoney(totalSales), 55, startY + 45);
        doc.text(toMoney(totalProfit), 55 + kpiW + 20, startY + 45);

        // Table - grouped by date (one row per date, summed total & profit)
        const tableStartY = startY + kpiH + 30;
        const byDate = data.reduce((acc: Record<string, { total: number; profit: number }>, item) => {
            const d = item.date;
            if (!acc[d]) acc[d] = { total: 0, profit: 0 };
            acc[d].total += item.total;
            acc[d].profit += item.profit;
            return acc;
        }, {});
        const sortedDates = Object.keys(byDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        const rows = sortedDates.map((d) => [
            format(new Date(d), 'dd MMM yyyy'),
            toMoney(byDate[d].total),
            toMoney(byDate[d].profit),
        ]);

        (doc as any).autoTable({
            startY: tableStartY,
            head: [['Date', 'Total', 'Profit']],
            body: rows,
            theme: 'striped',
            styles: {
                font: 'helvetica',
                fontSize: 10,
                cellPadding: 6,
            },
            headStyles: {
                fillColor: [13, 131, 144],
                textColor: 255,
                fontStyle: 'bold',
            },
            columnStyles: {
                0: { cellWidth: 120 },
                1: { cellWidth: 'auto', halign: 'right' },
                2: { cellWidth: 'auto', halign: 'right' },
            },
            didDrawPage: (dataCtx: any) => {
                const pageHeight = doc.internal.pageSize.getHeight();
                doc.setFontSize(9);
                doc.setTextColor(130);
                doc.text(`Page ${doc.getNumberOfPages()}`, w - 40, pageHeight - 25, { align: 'right' });
                doc.setFontSize(8);
                doc.text('MOJHOA AUTOMATIONS POS MANAGEMENT SYSTEM', w / 2, pageHeight - 12, { align: 'center' });
            },
            margin: { left: 40, right: 40 },
        });

        // Totals row (after table)
        const endY = (doc as any).lastAutoTable?.finalY ?? tableStartY;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Totals:', 40, endY + 24);
        doc.setFont('helvetica', 'normal');
        doc.text(`Sales ${toMoney(totalSales)}  |  Profit ${toMoney(totalProfit)}`, 95, endY + 24);

        doc.save(`report_${filterType}.pdf`);
    };

    return (
        <div className="panel pt-5">
            <h1 className="text-xl mb-5">Reporting & Analytics</h1>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <CashIcon2 className="dark:text-[#32a8a4] opacity-80 w-24 h-24" />
                    <h2 className="text-2xl text-gray-500 dark:text-gray-400">Total Sales</h2>
                    <p className="text-2xl font-semibold text-gray-800 dark:text-white">{toMoney(totalSales)}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <CashIcon className="dark:text-[#32a8a4] opacity-80 w-24 h-24" />
                    <h2 className="text-2xl text-gray-500 dark:text-gray-400">Total Profit</h2>
                    <p className="text-2xl font-semibold text-gray-800 dark:text-white">{toMoney(totalProfit)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
                <div>
                    <label>Filter Type</label>
                    <select className="form-input" value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
                        <option value="daily">Daily</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                        <option value="custom">Custom Date Range</option>
                    </select>
                </div>

                {filterType === 'custom' && (
                    <>
                        <div>
                            <label>Start Date</label>
                            <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div>
                            <label>End Date</label>
                            <input type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                    </>
                )}
            </div>

            <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">{loading ? 'Loading…' : `${data.length} records`}</div>
                <div className="flex gap-2">
                    <button type="button" className="btn btn-secondary flex items-center" onClick={exportToPDF}>
                        Download PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Reports;
