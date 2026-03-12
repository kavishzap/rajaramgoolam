import React, { useEffect, useState, useCallback } from 'react';
import ReactApexChart from 'react-apexcharts';
import { createClient } from '@supabase/supabase-js';
import { ApexOptions } from 'apexcharts';

// ✅ Supabase
const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ✅ Paging + parsing helpers
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

async function fetchAllByEmail<T = any>(opts: {
  table: string;
  select: string;
  emailColumn: string;
  email: string;
  orderBy?: string;
  ascending?: boolean;
}): Promise<T[]> {
  const { table, select, emailColumn, email, orderBy = 'id', ascending = false } = opts;
  const all: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq(emailColumn, email)
      .order(orderBy, { ascending })
      .range(from, to);

    if (error) throw error;

    const chunk = (data ?? []) as T[];
    if (chunk.length === 0) break;
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

interface RevenueChartProps {
  isDark: boolean;
  isRtl: boolean;
}

const RevenueChart: React.FC<RevenueChartProps> = ({ isDark, isRtl }) => {
  const [salesData, setSalesData] = useState<number[]>(Array(12).fill(0));
  const [invoiceData, setInvoiceData] = useState<number[]>(Array(12).fill(0));
  const [totalSales, setTotalSales] = useState<number>(0);
  const [totalInvoices, setTotalInvoices] = useState<number>(0);

  const load = useCallback(async () => {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.email) return;
      const userEmail = authData.user.email;

      const now = new Date();
      const currentYear = now.getFullYear();

      // ✅ Orders (chunked)
      const orders = await fetchAllByEmail<{
        order_date: string | Date | null;
        order_total: unknown;
      }>({
        table: 'orders',
        select: 'order_date, order_total, order_company_email',
        emailColumn: 'order_company_email',
        email: userEmail,
        orderBy: 'id',
        ascending: false,
      });

      // ✅ Invoices (chunked)
      const invoices = await fetchAllByEmail<{
        inv_due_date: string | Date | null;
        inv_total: unknown;
      }>({
        table: 'invoices',
        select: 'inv_due_date, inv_total, inv_company_email',
        emailColumn: 'inv_company_email',
        email: userEmail,
        orderBy: 'id',
        ascending: false,
      });

      const salesByMonth = Array(12).fill(0) as number[];
      const invoicesByMonth = Array(12).fill(0) as number[];
      let yearlySalesTotal = 0;
      let yearlyInvoiceTotal = 0;

      // Aggregate orders
      for (const o of orders) {
        if (!o?.order_date) continue;
        const d = new Date(o.order_date as any);
        if (d.getFullYear() !== currentYear) continue;
        const m = d.getMonth(); // 0..11
        const amt = parseAmount(o.order_total);
        salesByMonth[m] += amt;
        yearlySalesTotal += amt;
      }

      // Aggregate invoices
      for (const inv of invoices) {
        if (!inv?.inv_due_date) continue;
        const d = new Date(inv.inv_due_date as any);
        if (d.getFullYear() !== currentYear) continue;
        const m = d.getMonth();
        const amt = parseAmount(inv.inv_total);
        invoicesByMonth[m] += amt;
        yearlyInvoiceTotal += amt;
      }

      setSalesData([...salesByMonth]);
      setInvoiceData([...invoicesByMonth]);
      setTotalSales(yearlySalesTotal);
      setTotalInvoices(yearlyInvoiceTotal);
    } catch (err) {
      console.error('Error fetching revenue data:', err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revenueChart: ApexOptions = {
    chart: {
      height: 325,
      type: 'area',
      fontFamily: 'Nunito, sans-serif',
      zoom: { enabled: false },
      toolbar: { show: false },
    },
    dataLabels: { enabled: false },
    stroke: { show: true, curve: 'smooth', width: 2, lineCap: 'square' },
    colors: isDark ? ['#2196F3', '#F39C12'] : ['#1B55E2', '#FFA500'],
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: { show: true },
      labels: {
        offsetX: isRtl ? 2 : 0,
        offsetY: 5,
        style: { fontSize: '12px', cssClass: 'apexcharts-xaxis-title' },
      },
    },
    yaxis: {
      tickAmount: 7,
      labels: {
        formatter: (v: number) => `Rs ${Math.round(v).toLocaleString()}`,
        offsetX: isRtl ? -30 : -10,
        style: { fontSize: '12px', cssClass: 'apexcharts-yaxis-title' },
      },
      opposite: isRtl,
    },
    grid: {
      borderColor: isDark ? '#191E3A' : '#E0E6ED',
      strokeDashArray: 5,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      fontSize: '16px',
      markers: { width: 10, height: 10, offsetX: -2 },
      itemMargin: { horizontal: 10, vertical: 5 },
    },
    tooltip: { marker: { show: true }, x: { show: false } },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        inverseColors: false,
        opacityFrom: isDark ? 0.19 : 0.28,
        opacityTo: 0.05,
        stops: isDark ? [100, 100] : [45, 100],
      },
    },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold dark:text-[#32a8a4]">Total Sales & Invoices This Year</h2>
        <div className="text-right">
          <p className="text-lg font-bold dark:text-[#32a8a4]">Sales: Rs {totalSales.toLocaleString()}</p>
          <p className="text-lg font-bold dark:text-[#F39C12]">Invoices: Rs {totalInvoices.toLocaleString()}</p>
        </div>
      </div>
      <ReactApexChart
        series={[
          { name: 'Sales', data: salesData },
          { name: 'Invoices', data: invoiceData },
        ]}
        options={revenueChart}
        type="area"
        height={325}
      />
    </div>
  );
};

export default RevenueChart;
