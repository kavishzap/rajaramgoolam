import { useState, Fragment, useEffect, useCallback } from 'react';
import Tippy from '@tippyjs/react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import 'tippy.js/dist/tippy.css';
import { Dialog, Transition } from '@headlessui/react';
import Swal from 'sweetalert2';
import { useDispatch } from 'react-redux';
import { setPageTitle } from '../../store/themeConfigSlice';
import { Visibility, Delete } from '@mui/icons-material';
import { createClient } from '@supabase/supabase-js';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PAGE_SIZE = 1000;

/** Safe money formatter */
function toMoney(value: unknown): string {
  if (value === null || value === undefined) return '0.00';
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  let s = String(value).trim();
  if (!s) return '0.00';
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (s.includes(',') && !s.includes('.')) {
    const last = s.lastIndexOf(',');
    s = s.slice(0, last).replace(/,/g, '') + '.' + s.slice(last + 1);
  }
  s = s.replace(/[^0-9.-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

/** Safely parse order_items (string or array) */
function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Build a single-line add-ons note for table cell */
function buildAddOnsNote(item: any): string | null {
  // 1) Prefer addons_note if present
  if (item?.addons_note && String(item.addons_note).trim()) {
    return String(item.addons_note).trim();
  }
  // 2) Build from addons array
  if (Array.isArray(item?.addons) && item.addons.length > 0) {
    const bits = item.addons.map((a: any) => {
      const n = a?.name ?? 'Add-on';
      const q = a?.quantity ?? 1;
      return `${n} x${q}`;
    });
    return bits.length ? `Add-ons: ${bits.join(', ')}` : null;
  }
  return null;
}

/** Calculate a line total if line_total missing: base + addons subtotals */
function calcLineTotal(item: any): number {
  if (item?.line_total !== undefined && item?.line_total !== null) {
    const n = Number(item.line_total);
    if (Number.isFinite(n)) return n;
  }
  const price = Number(item?.price) || 0;
  const qty = Number(item?.quantity) || 0;
  let total = price * qty;
  if (Array.isArray(item?.addons)) {
    total += item.addons.reduce((acc: number, a: any) => {
      const ap = Number(a?.price) || 0;
      const aq = Number(a?.quantity) || 0;
      return acc + ap * aq;
    }, 0);
  }
  return total;
}

const Orders = () => {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(setPageTitle('Sales'));
  }, [dispatch]);

  const [orderList, setOrderList] = useState<any[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
  const [exportPeriod, setExportPeriod] = useState<'daily' | 'monthly' | 'yearly' | 'all' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [viewOrder, setViewOrder] = useState<any | null>(null);

  // Client-side pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));

  // Fetch all rows in chunks
  const fetchAllOrders = useCallback(async (userEmail: string) => {
    const all: any[] = [];
    let from = 0;
    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_date, order_items, order_total, order_profit, status, created_at, order_company_email, phone, table')
        .eq('order_company_email', userEmail)
        .order('id', { ascending: false })
        .range(from, to);

      if (error) throw error;
      const chunk = data ?? [];
      if (chunk.length === 0) break;
      all.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Normalize items safely
    const normalized = all.map((o) => ({
      ...o,
      order_items: parseItems(o.order_items),
    }));

    normalized.sort((a, b) => b.id - a.id);
    return normalized;
  }, []);

  const fetchOrders = useCallback(async () => {
    Swal.fire({
      title: 'Fetching sales details...',
      text: 'Please wait while we load your sales.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.email) {
        console.error('User not authenticated:', authError);
        setOrderList([]);
        setFilteredOrders([]);
        return;
      }
      const userEmail = authData.user.email;
      const orders = await fetchAllOrders(userEmail);
      setOrderList(orders);
      setFilteredOrders(orders);
    } catch (e) {
      console.error('Unexpected error fetching sales:', e);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to fetch sales details. Please try again later.',
        confirmButtonText: 'OK',
      });
    } finally {
      setLoading(false);
      Swal.close();
    }
  }, [fetchAllOrders]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const getOrdersForExport = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (exportPeriod === 'custom') {
      if (!customFrom || !customTo) return [];
      const fromDate = new Date(customFrom);
      const toDate = new Date(customTo);
      const fromTime = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
      const toTime = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime();
      return orderList.filter((o) => {
        if (!o.order_date) return false;
        const d = new Date(o.order_date);
        const orderTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        return orderTime >= fromTime && orderTime <= toTime;
      });
    }

    return orderList.filter((o) => {
      const d = o.order_date ? new Date(o.order_date) : null;
      if (!d) return exportPeriod === 'all';
      const orderTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      if (exportPeriod === 'daily') return orderTime === today;
      if (exportPeriod === 'monthly') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (exportPeriod === 'yearly') return d.getFullYear() === now.getFullYear();
      return true; // all
    });
  };

  // Period + search: first filter by period, then by search
  const ordersForPeriod = getOrdersForExport();
  const periodTotals = (() => {
    const total = ordersForPeriod.reduce((sum, o) => sum + (parseFloat(toMoney(o.order_total)) || 0), 0);
    return {
      totalSales: total,
      totalVat: total * 0.15,
      totalProfit: total * 0.85,
    };
  })();

  useEffect(() => {
    const q = search.trim().toLowerCase();
    const filtered = ordersForPeriod
      .filter((o) => o?.id?.toString().toLowerCase().includes(q))
      .sort((a, b) => b.id - a.id);

    setFilteredOrders(filtered);
    setCurrentPage(1);
  }, [search, orderList, exportPeriod, customFrom, customTo]);

  const deleteOrder = async (order: any) => {
    const confirm = await Swal.fire({
      title: `Are you sure you want to delete Sale #${order.id}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Delete',
    });

    if (!confirm.isConfirmed) return;

    try {
      const { error } = await supabase.from('orders').delete().eq('id', order.id);
      if (error) throw new Error(error.message);

      setOrderList((prev) => prev.filter((o) => o.id !== order.id));
      setFilteredOrders((prev) => prev.filter((o) => o.id !== order.id));

      Swal.fire({
        icon: 'success',
        title: 'Deleted!',
        text: 'The sale has been deleted successfully.',
        timer: 3000,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error('Error deleting order:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to delete sale. Please try again later.',
        timer: 3000,
        showConfirmButton: false,
      });
    }
  };

  const exportToPdf = () => {
    if (exportPeriod === 'custom' && (!customFrom || !customTo)) {
      Swal.fire({
        icon: 'warning',
        title: 'Missing dates',
        text: 'Please select both From and To dates for the custom range.',
      });
      return;
    }

    const toExport = getOrdersForExport();
    if (toExport.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'No data',
        text:
          exportPeriod === 'daily'
            ? 'No sales found for today.'
            : exportPeriod === 'monthly'
              ? 'No sales found for this month.'
              : exportPeriod === 'yearly'
                ? 'No sales found for this year.'
                : exportPeriod === 'custom'
                  ? 'No sales found for the selected custom date range.'
                  : 'No sales found for export.',
      });
      return;
    }

    Swal.fire({
      title: 'Generating PDF...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const w = doc.internal.pageSize.getWidth();

      const periodLabel =
        exportPeriod === 'daily'
          ? 'Daily'
          : exportPeriod === 'monthly'
            ? 'Monthly'
            : exportPeriod === 'yearly'
              ? 'Yearly'
              : exportPeriod === 'custom'
                ? 'Custom Range'
                : 'All';

      const subLabel =
        exportPeriod === 'daily'
          ? new Date().toLocaleDateString()
          : exportPeriod === 'monthly'
            ? new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' })
            : exportPeriod === 'yearly'
              ? String(new Date().getFullYear())
              : exportPeriod === 'custom'
                ? `${new Date(customFrom).toLocaleDateString()} - ${new Date(customTo).toLocaleDateString()}`
                : 'All time';

      doc.setFillColor(13, 131, 144);
      doc.rect(0, 0, w, 70, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(`${periodLabel} Sales Report`, 40, 36);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`${subLabel}`, 40, 52);
      doc.text(`Generated: ${new Date().toLocaleString()}`, w - 40, 52, { align: 'right' });
      doc.text(`Sales: ${toExport.length}`, 40, 64);
      const grandTotal = toExport.reduce((sum, o) => sum + (parseFloat(toMoney(o.order_total)) || 0), 0);
      const totalVat = grandTotal * 0.15;
      const totalProfit = grandTotal * 0.85;
      doc.text(`Total: Rs ${grandTotal.toFixed(2)}`, w - 40, 64, { align: 'right' });

      // Summary cards row: Total Sales, Total VAT, Total Profit
      const cardStartY = 90;
      const cardHeight = 60;
      const cardGap = 20;
      const cardWidth = (w - 80 - cardGap * 2) / 3; // 3 cards, 40pt margins, equal gaps

      doc.setDrawColor(230);
      doc.setFillColor(248, 248, 248);
      doc.roundedRect(40, cardStartY, cardWidth, cardHeight, 8, 8, 'FD');
      doc.roundedRect(40 + cardWidth + cardGap, cardStartY, cardWidth, cardHeight, 8, 8, 'FD');
      doc.roundedRect(40 + (cardWidth + cardGap) * 2, cardStartY, cardWidth, cardHeight, 8, 8, 'FD');

      doc.setTextColor(40, 40, 40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Total Sales', 55, cardStartY + 22);
      doc.text('Total VAT (15%)', 55 + cardWidth + cardGap, cardStartY + 22);
      doc.text('Total Profit', 55 + (cardWidth + cardGap) * 2, cardStartY + 22);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(14);
      doc.text(`Rs ${grandTotal.toFixed(2)}`, 55, cardStartY + 45);
      doc.text(`Rs ${totalVat.toFixed(2)}`, 55 + cardWidth + cardGap, cardStartY + 45);
      doc.text(`Rs ${totalProfit.toFixed(2)}`, 55 + (cardWidth + cardGap) * 2, cardStartY + 45);

      const rows = toExport.map((o) => [
        String(o.id),
        o.order_date ? new Date(o.order_date).toLocaleDateString() : '-',
        renderItemsCell(o.order_items || []).substring(0, 80),
        `Rs ${toMoney(o.order_total)}`,
        `Rs ${((parseFloat(toMoney(o.order_total)) || 0) * 0.15).toFixed(2)}`,
        `Rs ${((parseFloat(toMoney(o.order_total)) || 0) * 0.85).toFixed(2)}`,
      ]);

      const tableWidth = w - 80;
      const tableStartY = cardStartY + cardHeight + 30;
      (doc as any).autoTable({
        startY: tableStartY,
        head: [['Sale ID', 'Date', 'Items', 'Sale Total', 'VAT (15%)', 'Profit']],
        body: rows,
        theme: 'striped',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [13, 131, 144], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 55 },
          2: { cellWidth: 210 },
          3: { cellWidth: 55, halign: 'right' },
          4: { cellWidth: 55, halign: 'right' },
          5: { cellWidth: 100, halign: 'right' },
        },
        margin: { left: 40, right: 40 },
        tableWidth,
        didDrawPage: (dataCtx: any) => {
          const pageH = doc.internal.pageSize.getHeight();
          doc.setFontSize(9);
          doc.setTextColor(130);
          doc.text(`Page ${doc.getNumberOfPages()}`, w - 40, pageH - 20, { align: 'right' });
        },
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      doc.save(`sales_report_${exportPeriod}_${dateStr}.pdf`);
      Swal.close();
      Swal.fire({
        icon: 'success',
        title: 'Exported',
        text: 'Sales report has been downloaded.',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err: any) {
      Swal.close();
      Swal.fire({
        icon: 'error',
        title: 'Export Failed',
        text: err?.message || 'Could not export to PDF.',
      });
    }
  };

  /** Compact table cell view for items */
  function renderItemsCell(items: any[]): string {
    if (!Array.isArray(items) || items.length === 0) return '';
    // Show up to first 3 items compactly
    const parts = items.slice(0, 3).map((it) => {
      const base = `${it?.name ?? 'Item'} (x${it?.quantity ?? 1})`;
      const note = buildAddOnsNote(it);
      return note ? `${base} – ${note}` : base;
    });
    const extra = items.length > 3 ? `, +${items.length - 3} more` : '';
    return parts.join(', ') + extra;
  }

  /** Modal line item block */
  function ModalLine({ item }: { item: any }) {
    const note = buildAddOnsNote(item);
    const lineTotal = calcLineTotal(item);
    return (
      <li className="border rounded p-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">
            {item?.name ?? 'Item'} <span className="text-gray-500">x{item?.quantity ?? 1}</span>
          </div>
          <div className="font-semibold">Rs {toMoney(lineTotal)}</div>
        </div>
        {note && <div className="text-xs text-gray-500 mt-1">{note}</div>}

        {Array.isArray(item?.addons) && item.addons.length > 0 && (
          <ul className="mt-2 pl-3 border-l">
            {item.addons.map((a: any, idx: number) => (
              <li key={idx} className="flex items-center justify-between text-sm py-0.5">
                <span>
                  {a?.name ?? 'Add-on'} <span className="text-gray-500">x{a?.quantity ?? 1}</span>
                </span>
                <span>Rs {toMoney((Number(a?.price) || 0) * (Number(a?.quantity) || 0))}</span>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl">Sales</h2>
        <div className="flex sm:flex-row flex-col sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <select
              className="form-select w-auto"
              value={exportPeriod}
              onChange={(e) => setExportPeriod(e.target.value as 'daily' | 'monthly' | 'yearly' | 'all' | 'custom')}
            >
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="all">All</option>
              <option value="custom">Custom range</option>
            </select>
            {exportPeriod === 'custom' && (
              <>
                <input
                  type="date"
                  className="form-input w-[160px]"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <span className="text-sm">to</span>
                <input
                  type="date"
                  className="form-input w-[160px]"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </>
            )}
          </div>
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={exportToPdf}
            disabled={loading || orderList.length === 0}
          >
            Export to PDF
          </button>
          <div className="relative">
            <input
              type="text"
              placeholder="Search by Sale ID"
              className="form-input py-2 ltr:pr-11 rtl:pl-11 peer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Summary cards - Total Sales, Total VAT, Total Profit */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
        <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg text-gray-500 dark:text-gray-400">Total Sales</h2>
          <p className="text-xl font-semibold text-gray-800 dark:text-white">Rs {periodTotals.totalSales.toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg text-gray-500 dark:text-gray-400">Total VAT (15%)</h2>
          <p className="text-xl font-semibold text-gray-800 dark:text-white">Rs {periodTotals.totalVat.toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg text-gray-500 dark:text-gray-400">Total Profit</h2>
          <p className="text-xl font-semibold text-gray-800 dark:text-white">Rs {periodTotals.totalProfit.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-5 panel p-0 border-0 overflow-hidden">
        <div className="table-responsive">
          {loading ? (
            <p className="text-center py-5">Loading...</p>
          ) : filteredOrders.length === 0 ? (
            <p className="text-center py-5">No orders available</p>
          ) : (
            <table className="table-striped table-hover">
              <thead>
                <tr>
                  <th>Sale ID</th>
                  <th>Sale Date</th>
                  <th>Sale Items</th>
                  <th>Sale Total</th>
                  <th>VAT (15%)</th>
                  <th>
                    <Tippy
                      content={
                        <span className="block px-2 py-1.5 text-left text-sm">
                          <span className="font-semibold block mb-1">Profit formula</span>
                          <span className="text-white/90">(Selling price − Buying price) − 15% VAT</span>
                        </span>
                      }
                      trigger="mouseenter focus"
                      placement="top"
                      theme="dark"
                      animation="scale"
                      arrow={true}
                    >
                      <span className="cursor-help underline decoration-dotted decoration-gray-400">Profit</span>
                    </Tippy>
                  </th>
                  <th className="!text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((order) => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td>{order.order_date ? new Date(order.order_date).toLocaleDateString() : '-'}</td>
                      <td title="Click the eye icon to view full details">
                        {renderItemsCell(order.order_items)}
                      </td>
                      <td>Rs {toMoney(order.order_total)}</td>
                      <td>Rs {((parseFloat(toMoney(order.order_total)) || 0) * 0.15).toFixed(2)}</td>
                      <td>Rs {((parseFloat(toMoney(order.order_total)) || 0) * 0.85).toFixed(2)}</td>
                      <td>
                        <div className="flex gap-4 items-center justify-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => setViewOrder(order)}
                          >
                            <Visibility className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => deleteOrder(order)}
                          >
                            <Delete className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        {filteredOrders.length > itemsPerPage && (
          <div className="flex justify-center mt-4">
            <button
              className={`px-4 py-2 border ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <span className="px-4 py-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className={`px-4 py-2 border ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* View Order Modal */}
      <Transition appear show={viewOrder !== null} as={Fragment}>
        <Dialog as="div" open={viewOrder !== null} onClose={() => setViewOrder(null)} className="relative z-[51]">
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-[black]/60" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center px-4 py-8">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="bg-white dark:bg-[#1E293B] shadow-lg rounded-lg w-full max-w-md mx-auto text-black dark:text-white relative">
                  <button
                    type="button"
                    onClick={() => setViewOrder(null)}
                    className="absolute top-4 right-4 text-gray-500 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                  >
                    ✕
                  </button>
                  <div className="p-6">
                    <h3 className="text-xl font-semibold mb-4">Sale #{viewOrder?.id}</h3>
                    {viewOrder && (
                      <div>
                        <div className="border-b border-gray-200 dark:border-gray-700 pb-3 mb-3 text-sm grid grid-cols-2 gap-y-1">
                          <div><span className="font-semibold">Date:</span> {viewOrder.order_date ? new Date(viewOrder.order_date).toLocaleDateString() : '-'}</div>
                          <div><span className="font-semibold">Time:</span> {viewOrder.created_at && new Date(new Date(viewOrder.created_at).getTime() + 4 * 60 * 60 * 1000).toLocaleTimeString('en-GB', {hour: '2-digit',minute: '2-digit',hour12: false,})}</div>
                          {viewOrder.phone && <div><span className="font-semibold">Phone:</span> {viewOrder.phone}</div>}
                          {viewOrder.table && <div><span className="font-semibold">Table:</span> {viewOrder.table}</div>}
                        </div>

                        <div className="mb-4">
                          <h4 className="text-lg font-semibold mb-2">Products</h4>
                          <ul className="space-y-2">
                            {Array.isArray(viewOrder.order_items) &&
                              viewOrder.order_items.map((item: any, idx: number) => (
                                <ModalLine key={`${item?.name ?? 'item'}-${idx}`} item={item} />
                              ))}
                          </ul>
                        </div>

                        <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                          <div className="flex justify-between text-lg font-bold">
                            <span>Total:</span>
                            <span>Rs {toMoney(viewOrder.order_total)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default Orders;
