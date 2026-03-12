import React, { useEffect, useState, useCallback } from 'react';
import IconNotes from '../components/Icon/IconNotes';
import IconFile from '../components/Icon/IconShoppingBag';
import IconFile2 from '../components/Icon/IconShoppingCart';
import { createClient } from '@supabase/supabase-js';

// ✅ Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PAGE_SIZE = 1000;

// 🔒 Robust numeric parser → returns a safe number (never NaN)
function parseAmount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  let s = String(value).trim();
  if (!s) return 0;

  // If contains both comma and dot → commas are thousands separators
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  // If only commas → last comma is decimal
  else if (s.includes(',') && !s.includes('.')) {
    const i = s.lastIndexOf(',');
    s = s.slice(0, i).replace(/,/g, '') + '.' + s.slice(i + 1);
  }
  // Strip currency and other chars (keep digits, dot, minus)
  s = s.replace(/[^0-9.-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// 💵 Format numbers as money with thousands separators, e.g. 1568555 → "1,568,555.00"
function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// 🗓️ Format a Date to local YYYY-MM-DD (no UTC surprises)
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 🔁 Generic chunked fetch for a table scoped by company email
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

  // Loop until we get a chunk < PAGE_SIZE
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

const DashboardSummary: React.FC = () => {
  const [totalOrdersCount, setTotalOrdersCount] = useState<number>(0);
  const [totalSales, setTotalSales] = useState<number>(0);
  const [totalSalesThisYear, setTotalSalesThisYear] = useState<number>(0);
  const [totalInvoices, setTotalInvoices] = useState<number>(0);
  const [profitThisYear, setProfitThisYear] = useState<number>(0);
  const [totalProfitOverall, setTotalProfitOverall] = useState<number>(0);
  const [expensesThisYear, setExpensesThisYear] = useState<number>(0);
  const [todaySales, setTodaySales] = useState<{ day: number; night: number }>({ day: 0, night: 0 });

  const fetchData = useCallback(async () => {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.email) {
        console.error('User not authenticated:', authError);
        return;
      }

      const userEmail = authData.user.email;
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const todayStr = toLocalYMD(now);

      // 📦 Fetch ALL orders (chunked)
      const orders = await fetchAllByEmail<{
        order_date: string | Date;
        order_total: unknown;
        order_profit: unknown;
        day?: boolean | number | null;
        night?: boolean | number | null;
        order_company_email: string;
      }>({
        table: 'orders',
        select: 'order_date, order_total, order_profit, day, night, order_company_email',
        emailColumn: 'order_company_email',
        email: userEmail,
        orderBy: 'id',
        ascending: false,
      });

      // 📆 Filter orders for current year (for profit)
      const ordersThisYear = orders.filter((o) => {
        const d = new Date(o.order_date as any);
        return d.getFullYear() === currentYear;
      });

      // 🔢 Total number of orders (all time) for this tenant
      setTotalOrdersCount(orders.length);

      // 💰 Sum order profits
      const totalOrderProfitThisYear = ordersThisYear.reduce((acc, o) => acc + parseAmount(o.order_profit), 0);
      const totalOrderProfitAllTime = orders.reduce((acc, o) => acc + parseAmount(o.order_profit), 0);

      // 💵 Total Sales (all time) for this tenant
      const totalSalesAllTime = orders.reduce((acc, o) => acc + parseAmount(o.order_total), 0);
      setTotalSales(totalSalesAllTime);

      // 📅 Total Sales Amount This Year (by amount)
      const salesThisYearTotal = ordersThisYear.reduce((acc, o) => acc + parseAmount(o.order_total), 0);
      setTotalSalesThisYear(salesThisYearTotal);

      // ☀️🌙 Today sales (local date compare, by amount)
      const todayOrders = orders.filter((o) => toLocalYMD(new Date(o.order_date as any)) === todayStr);
      let dayTotal = 0;
      let nightTotal = 0;
      todayOrders.forEach((o) => {
        const total = parseAmount(o.order_total);
        // treat truthy booleans or 1 as true
        if (o.day) dayTotal += total;
        if (o.night) nightTotal += total;
      });
      setTodaySales({ day: dayTotal, night: nightTotal });

      // 🧾 Fetch ALL invoices (chunked)
      const invoices = await fetchAllByEmail<{
        id: number;
        inv_profit: unknown;
        inv_company_email: string;
        inv_date: string | Date | null;
      }>({
        table: 'invoices',
        select: 'id, inv_profit, inv_company_email, inv_date',
        emailColumn: 'inv_company_email',
        email: userEmail,
        orderBy: 'id',
        ascending: false,
      });

      // 📆 Filter invoices for current year (using invoice date)
      const invoicesThisYear = invoices.filter((inv) => {
        if (!inv.inv_date) return false;
        const d = new Date(inv.inv_date as any);
        return d.getFullYear() === currentYear;
      });

      setTotalInvoices(invoicesThisYear.length);

      const totalInvoiceProfitThisYear = invoicesThisYear.reduce(
        (acc, inv) => acc + parseAmount(inv.inv_profit),
        0,
      );
      const totalInvoiceProfitAllTime = invoices.reduce(
        (acc, inv) => acc + parseAmount(inv.inv_profit),
        0,
      );

      // 🧮 Profit This Year (orders + invoices restricted to current year)
      setProfitThisYear(totalOrderProfitThisYear + totalInvoiceProfitThisYear);

      // 🧮 Total Profit Overall (all-time)
      setTotalProfitOverall(totalOrderProfitAllTime + totalInvoiceProfitAllTime);

      // 💸 Fetch ALL expenses for this company
      const expenses = await fetchAllByEmail<{
        id: number;
        expense_total: unknown;
        expense_company_email: string;
        expense_date: string | Date | null;
      }>({
        table: 'expenses',
        select: 'id, expense_total, expense_company_email, expense_date',
        emailColumn: 'expense_company_email',
        email: userEmail,
        orderBy: 'id',
        ascending: false,
      });

      // 📆 Filter expenses for current year
      const expensesThisYearList = expenses.filter((exp) => {
        if (!exp.expense_date) return false;
        const d = new Date(exp.expense_date as any);
        return d.getFullYear() === currentYear;
      });

      const totalExpensesThisYear = expensesThisYearList.reduce(
        (acc, exp) => acc + parseAmount(exp.expense_total),
        0,
      );

      setExpensesThisYear(totalExpensesThisYear);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-5">
      {/* 🔢 Total Number of Sales (Order Count) */}
      <div className="panel flex flex-col items-center justify-center text-center">
        <div className="mb-4">
          <div className="text-lg font-bold mb-2 dark:text-[#32a8a4]">Total Number of Sales</div>
          <div className="dark:text-[#32a8a4] text-4xl">{totalOrdersCount}</div>
        </div>
        <IconFile className="dark:text-[#32a8a4] opacity-80 w-24 h-24" />
      </div>

      {/* ✅ Total Sales Amount */}
      <div className="panel flex flex-col items-center justify-center text-center">
        <div className="mb-4">
          <div className="text-lg font-bold mb-2 dark:text-[#32a8a4]">Total Sales Amount</div>
          <div className="dark:text-[#32a8a4] text-4xl">Rs {formatMoney(totalSales)}</div>
        </div>
        <IconFile className="dark:text-[#32a8a4] opacity-80 w-24 h-24" />
      </div>

      {/* 💰 Total Profit Made Till Now (Overall) */}
      <div className="panel flex flex-col items-center justify-center text-center">
        <div className="mb-4">
          <div className="text-lg font-bold mb-2 dark:text-[#32a8a4]">Total Profit Made Till Now</div>
          <div className="dark:text-[#32a8a4] text-4xl">Rs {formatMoney(totalProfitOverall)}</div>
        </div>
        <IconFile2 className="dark:text-[#32a8a4] opacity-80 w-24 h-24" />
      </div>

      {/* ✅ Total Sales Amount This Year */}
      <div className="panel flex flex-col items-center justify-center text-center">
        <div className="mb-4">
          <div className="text-lg font-bold mb-2 dark:text-[#32a8a4]">Total Sales Amount This Year</div>
          <div className="dark:text-[#32a8a4] text-4xl">Rs {formatMoney(totalSalesThisYear)}</div>
        </div>
        <IconFile2 className="dark:text-[#32a8a4] opacity-80 w-24 h-24" />
      </div>

      {/* ✅ Sales Today (Day / Night) card temporarily hidden
      <div className="panel flex flex-col items-center justify-center text-center">
        <div className="mb-4">
          <div className="text-lg font-bold mb-2 dark:text-[#32a8a4]">Sales Today</div>
          <div className="dark:text-[#32a8a4] text-md">
            Day Sales: <span className="font-bold">{todaySales.day.toFixed(2)}</span>
          </div>
          <div className="dark:text-[#32a8a4] text-md">
            Night Sales: <span className="font-bold">{todaySales.night.toFixed(2)}</span>
          </div>
        </div>
        <div className="dark:text-[#32a8a4] opacity-80 text-6xl">RS</div>
      </div>
      */}

      {/* ✅ Profit This Year */}
      <div className="panel flex flex-col items-center justify-center text-center">
        <div className="mb-4">
          <div className="text-lg font-bold mb-2 dark:text-[#32a8a4]">Profit This Year</div>
          <div className="dark:text-[#32a8a4] text-4xl">Rs {formatMoney(profitThisYear)}</div>
        </div>
        <IconNotes className="dark:text-[#32a8a4] opacity-80 w-24 h-24" />
      </div>

      {/* 💸 Expenses This Year */}
      <div className="panel flex flex-col items-center justify-center text-center">
        <div className="mb-4">
          <div className="text-lg font-bold mb-2 dark:text-[#e74c3c]">Expenses This Year</div>
          <div className="dark:text-[#e74c3c] text-4xl">Rs {formatMoney(expensesThisYear)}</div>
        </div>
        <IconNotes className="dark:text-[#e74c3c] opacity-80 w-24 h-24" />
      </div>
    </div>
  );
};

export default DashboardSummary;
