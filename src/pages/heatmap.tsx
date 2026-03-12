// src/components/DayTimeHeatmap.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { createClient } from '@supabase/supabase-js';

// ✅ Supabase client (same pattern as your other components)
const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PAGE_SIZE = 1000;

async function fetchAllByEmail<T = any>(opts: { table: string; select: string; emailColumn: string; email: string; orderBy?: string; ascending?: boolean }): Promise<T[]> {
    const { table, select, emailColumn, email, orderBy = 'id', ascending = false } = opts;
    const all: T[] = [];
    let from = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await supabase.from(table).select(select).eq(emailColumn, email).order(orderBy, { ascending }).range(from, to);

        if (error) throw error;

        const chunk = (data ?? []) as T[];
        if (chunk.length === 0) break;

        all.push(...chunk);
        if (chunk.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return all;
}

interface DayTimeHeatmapProps {
    isDark: boolean;
    isRtl: boolean;
}

type OrderRow = {
    created_at?: string | null;
    order_date?: string | null;
    status: boolean | null;
};

const DayTimeHeatmap: React.FC<DayTimeHeatmapProps> = ({ isDark, isRtl }) => {
    const [matrix, setMatrix] = useState<number[][]>(() => Array.from({ length: 24 }, () => Array(7).fill(0)));
    const [maxValue, setMaxValue] = useState(0);
    const [loading, setLoading] = useState(false);
    const [hasData, setHasData] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setHasData(false);

            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData?.user?.email) {
                console.error('User not authenticated:', authError);
                return;
            }

            const userEmail = authData.user.email;

            const orders = await fetchAllByEmail<OrderRow>({
                table: 'orders',
                // You can add more fields if needed later
                select: 'created_at, order_date, status',
                emailColumn: 'order_company_email',
                email: userEmail,
                orderBy: 'id',
                ascending: false,
            });

            // 24 hours x 7 days
            const newMatrix: number[][] = Array.from({ length: 24 }, () => Array(7).fill(0));
            let localMax = 0;
            let any = false;

            for (const o of orders) {
                if (o.status === false) continue; // Ignore cancelled/unpaid if that's what status=false means

                const dtString = o.created_at ?? o.order_date ?? null;
                if (!dtString) continue;

                const d = new Date(dtString);
                if (isNaN(d.getTime())) continue;

                const dow = d.getDay(); // 0 (Sun) .. 6 (Sat)
                const hour = d.getHours(); // 0 .. 23

                if (dow < 0 || dow > 6 || hour < 0 || hour > 23) continue;

                newMatrix[hour][dow] += 1;
                any = true;
                if (newMatrix[hour][dow] > localMax) {
                    localMax = newMatrix[hour][dow];
                }
            }

            setMatrix(newMatrix);
            setMaxValue(localMax);
            setHasData(any);
        } catch (err) {
            console.error('Error loading day/time heatmap:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const series = useMemo(() => {
        // Each series = one hour row
        return Array.from({ length: 24 }, (_, hour) => ({
            name: `${hour.toString().padStart(2, '0')}:00`,
            data: dayLabels.map((day, dow) => ({
                x: day,
                y: matrix[hour][dow],
            })),
        }));
    }, [matrix]);

    const max = Math.max(maxValue, 1);

    const options: ApexOptions = {
        chart: {
            type: 'heatmap',
            height: 400,
            fontFamily: 'Nunito, sans-serif',
            toolbar: { show: false },
        },
        plotOptions: {
            heatmap: {
                shadeIntensity: 0.5,
                distributed: false,
                colorScale: {
                    ranges: [
                        {
                            from: 0,
                            to: 0,
                            name: 'No orders',
                            color: isDark ? '#111827' : '#F3F4F6',
                        },
                        {
                            from: 1,
                            to: Math.max(1, Math.round(max * 0.3)),
                            name: 'Low',
                            color: isDark ? '#155e75' : '#BFDBFE',
                        },
                        {
                            from: Math.round(max * 0.3) + 1,
                            to: Math.max(1, Math.round(max * 0.7)),
                            name: 'Medium',
                            color: isDark ? '#0e7490' : '#60A5FA',
                        },
                        {
                            from: Math.round(max * 0.7) + 1,
                            to: max,
                            name: 'High',
                            color: isDark ? '#06b6d4' : '#1D4ED8',
                        },
                    ],
                },
            },
        },
        dataLabels: {
            enabled: false,
        },
        xaxis: {
            type: 'category',
            position: 'top',
            labels: {
                style: { fontSize: '12px' },
            },
        },
        yaxis: {
            labels: {
                style: { fontSize: '10px' },
            },
            opposite: isRtl,
        },
        grid: {
            borderColor: isDark ? '#191E3A' : '#E0E6ED',
            strokeDashArray: 3,
        },
        tooltip: {
            y: {
                formatter: (val: number) => `${val} orders`,
            },
        },
        legend: {
            position: 'bottom',
            fontSize: '12px',
        },
    };

    return (
        <div>
            <h2 className="text-lg font-semibold mb-2 dark:text-[#32a8a4]">Order Activity Heatmap (Day vs Time)</h2>
            <p className="text-xs mb-4 opacity-70">Each cell shows how many orders you receive in that hour slot for that day of the week.</p>

            {loading ? (
                <p className="text-sm opacity-70">Loading…</p>
            ) : !hasData ? (
                <p className="text-sm opacity-70">No order activity yet for this view.</p>
            ) : (
                <ReactApexChart type="heatmap" height={400} options={options} series={series} />
            )}
        </div>
    );
};

export default DayTimeHeatmap;
