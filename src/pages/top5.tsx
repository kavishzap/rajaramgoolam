import React, { useEffect, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface TopProductsAllTimeChartProps {
    isDark: boolean;
    isRtl: boolean;
    includeAddons?: boolean;
}

type OrderRow = {
    order_items: string | null;
    order_company_email: string;
    status: boolean | null;
};

type OrderItem = {
    product_id?: number;
    name?: string;
    quantity?: number;
    addons?: { name?: string; quantity?: number }[];
};

const TopProductsAllTimeChart: React.FC<TopProductsAllTimeChartProps> = ({ isDark, isRtl, includeAddons = false }) => {
    const [productTotals, setProductTotals] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const fetchAllTimeTopProducts = async () => {
        try {
            setLoading(true);

            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData?.user?.email) {
                console.error('User not authenticated:', authError);
                return;
            }

            const userEmail = authData.user.email;

            const pageSize = 1000; // Supabase default page size
            let from = 0;
            let done = false;

            const tally: Record<string, number> = {};

            while (!done) {
                const { data, error } = await supabase
                    .from('orders')
                    .select('order_items, status', { count: 'exact', head: false })
                    .eq('order_company_email', userEmail)
                    .range(from, from + pageSize - 1);

                if (error) throw error;

                (data ?? []).forEach((row: { order_items: string | null; status: boolean | null }) => {
                    if (row.status === false || !row.order_items) return;

                    let items: Array<{ name?: string; quantity?: number; addons?: Array<{ name?: string; quantity?: number }> }> = [];
                    try {
                        items = JSON.parse(row.order_items);
                    } catch {
                        return;
                    }

                    items.forEach((it) => {
                        const qty = Number(it.quantity ?? 0) || 0;
                        const name = it.name?.trim();
                        if (name && qty > 0) tally[name] = (tally[name] ?? 0) + qty;

                        if (includeAddons && Array.isArray(it.addons)) {
                            it.addons.forEach((ad) => {
                                const aq = Number(ad.quantity ?? 0) || 0;
                                const an = ad.name?.trim();
                                if (an && aq > 0) tally[an] = (tally[an] ?? 0) + aq;
                            });
                        }
                    });
                });

                // Stop when we got less than a full page
                if (!data || data.length < pageSize) {
                    done = true;
                } else {
                    from += pageSize;
                }
            }

            setProductTotals(tally);
        } catch (err) {
            console.error('Error fetching top products:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllTimeTopProducts();
    }, [includeAddons]);

    const top5 = Object.entries(productTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const options: ApexOptions = {
        chart: {
            type: 'bar',
            height: 320,
            fontFamily: 'Nunito, sans-serif',
            toolbar: { show: false },
        },
        plotOptions: {
            bar: {
                horizontal: true,
                borderRadius: 6,
                barHeight: '60%',
            },
        },
        colors: isDark ? ['#32a8a4'] : ['#1B55E2'],
        dataLabels: { enabled: false },
        xaxis: {
            categories: top5.map(([name]) => name),
            labels: { style: { fontSize: '12px' } },
        },
        yaxis: {
            opposite: isRtl,
            labels: { style: { fontSize: '12px' } },
        },
        grid: {
            borderColor: isDark ? '#191E3A' : '#E0E6ED',
            strokeDashArray: 5,
        },
        tooltip: {
            y: {
                formatter: (val: number) => `${val} sold`,
            },
        },
    };

    return (
        <div>
            <h2 className="text-lg font-semibold mb-4 dark:text-[#32a8a4]">Top 5 Products (All Time)</h2>

            {loading ? (
                <p className="text-sm opacity-70">Loading…</p>
            ) : top5.length === 0 ? (
                <p className="text-sm opacity-70">No sales data available.</p>
            ) : (
                <ReactApexChart key={top5.map(([n]) => n).join(',')} series={[{ name: 'Qty Sold', data: top5.map(([, qty]) => qty) }]} options={options} type="bar" height={320} />
            )}
        </div>
    );
};

export default TopProductsAllTimeChart;
