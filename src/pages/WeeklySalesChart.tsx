import React, { useEffect, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import { createClient } from '@supabase/supabase-js';
import { ApexOptions } from 'apexcharts';

const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface WeeklySalesChartProps {
    isDark: boolean;
    isRtl: boolean;
}

const WeeklySalesChart: React.FC<WeeklySalesChartProps> = ({ isDark, isRtl }) => {
    const [salesData, setSalesData] = useState<number[]>(Array(7).fill(0));
    const [totalSales, setTotalSales] = useState<number>(0);
    const [currentDate, setCurrentDate] = useState(new Date());

    const getWeekRange = (date: Date) => {
        const start = new Date(date);
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday
        const monday = new Date(start.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { monday, sunday };
    };

    const fetchWeeklySales = async () => {
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData?.user?.email) {
                console.error('User not authenticated:', authError);
                return;
            }

            const userEmail = authData.user.email;
            const { monday, sunday } = getWeekRange(currentDate);

            const from = monday.toISOString().split('T')[0];
            const to = sunday.toISOString().split('T')[0];

            const { data: orders, error } = await supabase.from('orders').select('order_date, order_total').eq('order_company_email', userEmail).gte('order_date', from).lte('order_date', to);

            if (error) throw error;

            const dailySales = Array(7).fill(0);
            let total = 0;

            orders.forEach((order) => {
                const date = new Date(order.order_date);
                const dayIndex = (date.getDay() + 6) % 7; // Monday = 0
                const raw = order.order_total || '0';
                const clean = parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
                dailySales[dayIndex] += clean;
                total += clean;
            });

            setSalesData(dailySales);
            setTotalSales(total);
            console.log('Weekly sales data:', salesData);
        } catch (error) {
            console.error('Error fetching weekly sales:', error);
        }
    };

    useEffect(() => {
        fetchWeeklySales();
    }, [currentDate]);

    const handlePrevWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() - 7);
        setCurrentDate(newDate);
    };

    const handleNextWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() + 7);
        setCurrentDate(newDate);
    };

    const getWeekLabels = (monday: Date): string[] => {
        const labels: string[] = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + i);
            const weekday = day.toLocaleDateString(undefined, { weekday: 'short' }); // e.g., Mon
            const datePart = day.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }); // e.g., 01/04
            labels.push(`${weekday} (${datePart})`);
        }
        return labels;
    };

    const options: ApexOptions = {
        chart: {
            height: 300,
            type: 'bar',
            fontFamily: 'Nunito, sans-serif',
            toolbar: { show: false },
        },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '50%',
                borderRadius: 5,
            },
        },
        colors: isDark ? ['#32a8a4'] : ['#1B55E2'],
        dataLabels: { enabled: false },
        xaxis: {
            categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            labels: {
                style: {
                    fontSize: '12px',
                    cssClass: 'apexcharts-xaxis-title',
                },
            },
        },
        yaxis: {
            labels: {
                formatter: (value: number) => `Rs ${value.toLocaleString()}`,
                style: {
                    fontSize: '12px',
                    cssClass: 'apexcharts-yaxis-title',
                },
            },
            opposite: isRtl,
        },
        grid: {
            borderColor: isDark ? '#191E3A' : '#E0E6ED',
            strokeDashArray: 5,
        },
        tooltip: {
            y: {
                formatter: (val: number) => `Rs ${val.toLocaleString()}`,
            },
        },
    };

    const { monday, sunday } = getWeekRange(currentDate);
    const xAxisLabels = getWeekLabels(monday);
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold dark:text-[#32a8a4]">
                    Weekly Sales ({monday.toLocaleDateString()} - {sunday.toLocaleDateString()})
                </h2>
                <div className="text-right">
                    <p className="text-lg font-bold dark:text-[#32a8a4]">Total: Rs {totalSales.toLocaleString()}</p>
                </div>
            </div>

            <div className="flex justify-end gap-2 mb-2">
                <button onClick={handlePrevWeek} className="px-3 py-1 text-sm border rounded dark:text-white dark:border-gray-600">
                    ← Previous
                </button>
                <button onClick={handleNextWeek} className="px-3 py-1 text-sm border rounded dark:text-white dark:border-gray-600">
                    Next →
                </button>
            </div>

            <ReactApexChart
                key={salesData.join(',')} // This forces rerender when data changes
                series={[{ name: 'Sales', data: salesData }]}
                options={options}
                type="bar"
                height={300}
            />
        </div>
    );
};

export default WeeklySalesChart;
