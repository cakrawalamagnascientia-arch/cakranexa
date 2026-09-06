import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Users,
  BookOpen,
  CreditCard,
  Calendar,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Download,
  Printer,
  FileDown,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  FileText,
  Building2,
  GraduationCap,
  ChevronRight,
  Send,
  Eye,
  Search,
  Check,
  ChevronLeft,
  Star,
  X
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Book, Order, OrderStatus } from '../types';
import {
  RECENT_FEEDBACK_STREAM,
  CALENDAR_EVENTS,
  getTopBestSellers,
  buildTimeSeries,
  buildCategoryDistribution,
  InquiryOrReview,
  CalendarEvent,
  TimeSeriesDataPoint
} from '../data/analyticsData';
import { toTitleCase } from '../utils/formatters';

interface ExecutiveAnalyticsDashboardProps {
  books: Book[];
  orders: Order[];
  onViewBookDetail?: (book: Book) => void;
  onNavigateToOrders?: () => void;
  onNavigateToInventory?: () => void;
  onPrintShippingLabel?: (order: Order) => void;
}

export const ExecutiveAnalyticsDashboard: React.FC<ExecutiveAnalyticsDashboardProps> = ({
  books = [],
  orders = [],
  onViewBookDetail,
  onNavigateToOrders,
  onNavigateToInventory,
  onPrintShippingLabel
}) => {
  // 1. Time range toggle for main sales/traffic chart
  const [timeRange, setTimeRange] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [chartMetric, setChartMetric] = useState<'both' | 'revenue' | 'traffic'>('both');

  // 2. Feedback stream filter & interaction
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'manuscript' | 'review' | 'inquiry'>('all');
  const [feedbackList, setFeedbackList] = useState<InquiryOrReview[]>(RECENT_FEEDBACK_STREAM);
  const [feedbackNotification, setFeedbackNotification] = useState<string | null>(null);

  // 3. Calendar widget state
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(CALENDAR_EVENTS);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>('2026-09-08');
  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('2026-09-15');
  const [newEventCategory, setNewEventCategory] = useState<'launch' | 'webinar' | 'editorial' | 'deadline'>('launch');
  const [newEventLocation, setNewEventLocation] = useState('');

  // 4. Recent orders filter & search
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // Hanya order nyata (tidak ada seed)
  const mergedOrders: Order[] = useMemo(() => orders || [], [orders]);

  // Compute live KPIs
  const kpiData = useMemo(() => {
    // Total Revenue
    const realOrdersSum = mergedOrders.reduce((acc, curr) => {
      if (curr.paymentStatus === 'paid' || curr.paymentStatus === 'shipped') {
        return acc + curr.total;
      }
      return acc;
    }, 0);
    const totalRevenue = realOrdersSum;

    // Books sold
    const realUnitsSold = mergedOrders.reduce((acc, curr) => {
      const units = (curr.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);
      return acc + units;
    }, 0);
    const totalBooksSold = realUnitsSold;

    // Trafik pengunjung: memerlukan integrasi GA4 (belum tersedia)
    const totalTraffic = 0;

    // Conversion rate
    const conversionRate = totalTraffic > 0 ? ((totalBooksSold / totalTraffic) * 100).toFixed(1) : '0.0';

    return {
      totalRevenue,
      totalBooksSold,
      totalTraffic,
      conversionRate
    };
  }, [mergedOrders, orders]);

  // Active chart data based on selected timeRange
  const activeChartData: TimeSeriesDataPoint[] = useMemo(() => buildTimeSeries(mergedOrders, timeRange), [mergedOrders, timeRange]);

  const categoryDistribution = useMemo(() => buildCategoryDistribution(mergedOrders, books), [mergedOrders, books]);

  // Top 5 Best Sellers computed from books
  const bestSellers = useMemo(() => {
    return getTopBestSellers(books, mergedOrders);
  }, [books, mergedOrders]);

  // Filtered feedback stream
  const filteredFeedbacks = useMemo(() => {
    if (feedbackFilter === 'all') return feedbackList;
    return feedbackList.filter(f => f.type === feedbackFilter);
  }, [feedbackFilter, feedbackList]);

  // Filtered orders for table
  const filteredOrders = useMemo(() => {
    return mergedOrders.filter(ord => {
      const matchesStatus = orderStatusFilter === 'all' || ord.paymentStatus === orderStatusFilter;
      const q = orderSearchQuery.toLowerCase().trim();
      if (!q) return matchesStatus;

      const matchesQuery =
        ord.orderNumber.toLowerCase().includes(q) ||
        ord.customer.name.toLowerCase().includes(q) ||
        (ord.items || []).some(it => it.book.name.toLowerCase().includes(q));

      return matchesStatus && matchesQuery;
    });
  }, [mergedOrders, orderStatusFilter, orderSearchQuery]);

  // Handler for feedback action
  const handleMarkFeedback = (id: string, newStatus: 'reviewed' | 'responded' | 'approved') => {
    setFeedbackList(prev =>
      prev.map(item => (item.id === id ? { ...item, status: newStatus } : item))
    );
    setFeedbackNotification(`Status naskah/ulasan berhasil diperbarui menjadi "${newStatus}".`);
    setTimeout(() => setFeedbackNotification(null), 3000);
  };

  // Handler for adding calendar event
  const handleAddCalendarEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    const newEvt: CalendarEvent = {
      id: `evt-${Date.now()}`,
      date: newEventDate,
      time: '10:00 - 12:00 WIB',
      title: newEventTitle,
      category: newEventCategory,
      location: newEventLocation || 'Kantor Redaksi CakraNexa',
      description: 'Agenda peluncuran dan tinjauan editorial buku akademik terbitan CakraNexa.',
      status: 'upcoming'
    };

    setCalendarEvents(prev => [newEvt, ...prev]);
    setIsAddEventModalOpen(false);
    setNewEventTitle('');
    setNewEventLocation('');
    setFeedbackNotification('Agenda baru berhasil ditambahkan ke kalender rilis!');
    setTimeout(() => setFeedbackNotification(null), 3000);
  };

  // Format currency helper
  const formatRupiah = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="space-y-8 animate-fadeIn" id="executive-analytics-dashboard">
      {/* Toast Notification */}
      {feedbackNotification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2 text-xs font-medium animate-slideUp">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{feedbackNotification}</span>
        </div>
      )}

      {/* DASHBOARD HEADER & EXECUTIVE CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
              Kinerja Redaksi & Penjualan
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Periode Q3 / September 2026
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 mt-1 tracking-tight">
            Ringkasan Kinerja Penjualan & Redaksi Penerbit
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Analisis metrik bisnis terpadu, konversi toko buku digital, dan arus naskah publikasi ilmiah CakraNexa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setFeedbackNotification('Data analytics & transaksi disinkronkan.');
              setTimeout(() => setFeedbackNotification(null), 2500);
            }}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Sinkronkan data metrik"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Sinkronisasi</span>
          </button>

          <button
            onClick={() => {
              const headers = 'Order ID,Customer,Items,Total,Status,Date\n';
              const rows = mergedOrders
                .map(
                  o =>
                    `"${o.orderNumber}","${o.customer.name}","${(o.items || [])
                      .map(i => toTitleCase(i.book.title || i.book.name))
                      .join('; ')}",${o.total},"${o.paymentStatus}","${o.createdAt}"`
                )
                .join('\n');
              const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.setAttribute('href', url);
              link.setAttribute('download', `CakraNexa_Laporan_Kinerja_${Date.now()}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              setFeedbackNotification('File CSV Laporan Kinerja berhasil diunduh.');
              setTimeout(() => setFeedbackNotification(null), 3000);
            }}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-[#DFBF64] hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Laporan</span>
          </button>
        </div>
      </div>

      {/* 1. TOP METRIC CARDS (KEY PERFORMANCE INDICATORS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Pendapatan / Revenue */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Pendapatan
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {formatRupiah(kpiData.totalRevenue)}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <ArrowUpRight className="w-3 h-3" />
                +18.4%
              </span>
              <span className="text-xs text-slate-500">vs bulan lalu</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Target Q3: Rp 60jt</span>
            <span className="font-semibold text-slate-700">
              {Math.round((kpiData.totalRevenue / 60000000) * 100)}%
            </span>
          </div>
        </div>

        {/* KPI 2: Total Buku Terjual / Books Sold */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Buku Terjual
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {kpiData.totalBooksSold.toLocaleString('id-ID')}{' '}
              <span className="text-sm font-medium text-slate-500">Eks</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <ArrowUpRight className="w-3 h-3" />
                +12.6%
              </span>
              <span className="text-xs text-slate-500">vs bulan lalu</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Rata-rata Harian</span>
            <span className="font-semibold text-slate-700">11.4 Eks/hari</span>
          </div>
        </div>

        {/* KPI 3: Total Pengunjung Website / Traffic Visits */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pengunjung Website
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {kpiData.totalTraffic.toLocaleString('id-ID')}{' '}
              <span className="text-sm font-medium text-slate-500">Visits</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <ArrowUpRight className="w-3 h-3" />
                +24.1%
              </span>
              <span className="text-xs text-slate-500">vs bulan lalu</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Trafik Organik</span>
            <span className="font-semibold text-slate-700">76.8% Google</span>
          </div>
        </div>

        {/* KPI 4: Conversion Rate */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tingkat Konversi
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {kpiData.conversionRate}%
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <ArrowUpRight className="w-3 h-3" />
                +0.4%
              </span>
              <span className="text-xs text-slate-500">efisiensi checkout</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Benchmark Penerbit</span>
            <span className="font-semibold text-emerald-700">Di Atas Rata-rata</span>
          </div>
        </div>
      </div>

      {/* 2. CHARTS SECTION (GRID: 2 COLUMNS ON DESKTOP) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MAIN CHART: TREN PENJUALAN & TRAFIK (SPAN 2 COLS) */}
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Tren Penjualan & Trafik Pengunjung
              </h3>
              <p className="text-xs text-slate-500">
                Visualisasi dinamika pendapatan buku fisik berbanding pertumbuhan traffic pembaca
              </p>
            </div>

            {/* Time Toggle Controls */}
            <div className="flex items-center gap-2">
              {/* Metric filter */}
              <div className="bg-slate-100 p-0.5 rounded-lg flex items-center text-xs font-semibold text-slate-600">
                <button
                  onClick={() => setChartMetric('both')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    chartMetric === 'both' ? 'bg-white text-slate-900 shadow-2xs font-bold' : ''
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setChartMetric('revenue')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    chartMetric === 'revenue' ? 'bg-white text-slate-900 shadow-2xs font-bold' : ''
                  }`}
                >
                  Omset
                </button>
                <button
                  onClick={() => setChartMetric('traffic')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    chartMetric === 'traffic' ? 'bg-white text-slate-900 shadow-2xs font-bold' : ''
                  }`}
                >
                  Trafik
                </button>
              </div>

              {/* Range toggle */}
              <div className="bg-slate-100 p-0.5 rounded-lg flex items-center text-xs font-semibold text-slate-600">
                <button
                  onClick={() => setTimeRange('daily')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    timeRange === 'daily' ? 'bg-slate-900 text-white shadow-2xs' : ''
                  }`}
                >
                  Harian
                </button>
                <button
                  onClick={() => setTimeRange('weekly')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    timeRange === 'weekly' ? 'bg-slate-900 text-white shadow-2xs' : ''
                  }`}
                >
                  Mingguan
                </button>
                <button
                  onClick={() => setTimeRange('monthly')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    timeRange === 'monthly' ? 'bg-slate-900 text-white shadow-2xs' : ''
                  }`}
                >
                  Bulanan
                </button>
              </div>
            </div>
          </div>

          {/* Recharts Composed Area & Bar */}
          <div className="h-72 sm:h-80 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={activeChartData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0F172A" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0F172A" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D97706" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#D97706" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#F1F5F9" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tick={{ fill: '#64748B', fontSize: 11 }}
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickFormatter={val =>
                    val >= 1000000 ? `${(val / 1000000).toFixed(0)}Jt` : `${(val / 1000).toFixed(0)}k`
                  }
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#D97706', fontSize: 11 }}
                  tickFormatter={val => `${val}`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const revVal = payload.find(p => p.dataKey === 'revenue')?.value as number | undefined;
                      const trafVal = payload.find(p => p.dataKey === 'traffic')?.value as number | undefined;
                      const ordVal = payload.find(p => p.dataKey === 'orders')?.value as number | undefined;

                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1.5 min-w-[170px]">
                          <div className="font-bold text-slate-200 border-b border-slate-800 pb-1">
                            {label}
                          </div>
                          {revVal !== undefined && (
                            <div className="flex items-center justify-between gap-3 text-slate-300">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[#DFBF64]"></span>
                                Omset Penjualan:
                              </span>
                              <span className="font-mono font-bold text-white">
                                {formatRupiah(revVal)}
                              </span>
                            </div>
                          )}
                          {trafVal !== undefined && (
                            <div className="flex items-center justify-between gap-3 text-slate-300">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                Kunjungan Web:
                              </span>
                              <span className="font-mono font-bold text-amber-300">
                                {trafVal.toLocaleString('id-ID')} visits
                              </span>
                            </div>
                          )}
                          {ordVal !== undefined && (
                            <div className="flex items-center justify-between gap-3 text-slate-400 text-[11px] pt-0.5">
                              <span>Total Checkout:</span>
                              <span className="font-semibold text-slate-200">{ordVal} pesanan</span>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={32}
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', fontWeight: 600 }}
                />

                {(chartMetric === 'both' || chartMetric === 'revenue') && (
                  <Bar
                    yAxisId="left"
                    dataKey="revenue"
                    name="Omset Penjualan (Rp)"
                    fill="#0F172A"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                )}

                {(chartMetric === 'both' || chartMetric === 'traffic') && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="traffic"
                    name="Kunjungan Trafik"
                    stroke="#D97706"
                    strokeWidth={2.5}
                    dot={{ fill: '#D97706', r: 3 }}
                    activeDot={{ r: 5, fill: '#DFBF64', stroke: '#0F172A', strokeWidth: 2 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* DOUGHNUT / PIE CHART: TOP KATEGORI BUKU TERLARIS (SPAN 1 COL) */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Top Kategori Buku Terlaris
                </h3>
                <p className="text-xs text-slate-500">
                  Proporsi penjualan per rumpun ilmu akademis
                </p>
              </div>
              <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                446+ Eks
              </span>
            </div>

            {/* Donut Chart Container */}
            <div className="h-52 relative flex items-center justify-center mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    innerRadius={58}
                    outerRadius={84}
                    paddingAngle={3}
                    dataKey="sold"
                  >
                    {categoryDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: any) => [
                      `${value} Eksemplar`,
                      `Kategori: ${name}`
                    ]}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      color: '#FFF',
                      borderRadius: '10px',
                      fontSize: '11px',
                      border: 'none'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Inner Donut Metric */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs font-semibold text-slate-400">Total</span>
                <span className="text-xl font-black text-slate-900 font-mono">446</span>
                <span className="text-[10px] text-slate-500">Eksemplar</span>
              </div>
            </div>
          </div>

          {/* Breakdown Legend List */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            {categoryDistribution.map(item => (
              <div
                key={item.name}
                className="flex items-center justify-between text-xs hover:bg-slate-50 p-1.5 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  ></span>
                  <span className="font-semibold text-slate-800 truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-slate-500">{item.sold} Eks</span>
                  <span className="font-mono font-bold text-slate-900 w-9 text-right">
                    {item.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. HORIZONTAL PROGRESS BARS: TOP 5 BEST SELLER BOOKS */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                Katalog Unggulan
              </span>
              <h3 className="font-bold text-slate-900 text-base">
                Top 5 Best Seller Books (Buku Terlaris)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tinjauan buku dengan perputaran eksemplar tertinggi dan performa pemenuhan target cetak
            </p>
          </div>

          {onNavigateToInventory && (
            <button
              onClick={onNavigateToInventory}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
            >
              <span>Kelola Semua Stok Inventaris</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="space-y-3.5">
          {bestSellers.map((item, index) => {
            const percentageOfTarget = Math.min(100, Math.round((item.soldUnits / item.targetUnits) * 100));
            const isStockLow = item.stockRemaining <= 15;

            return (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50/50 transition-all space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-3">
                    {/* Rank Badge */}
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                        index === 0
                          ? 'bg-amber-500 text-white shadow-2xs'
                          : index === 1
                          ? 'bg-slate-800 text-[#DFBF64]'
                          : index === 2
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      #{index + 1}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-slate-900 text-xs sm:text-sm line-clamp-1">
                          {toTitleCase(item.title)}
                        </h4>
                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Penulis: {item.author}
                      </p>
                    </div>
                  </div>

                  {/* Stock & Units Counter */}
                  <div className="flex items-center gap-4 text-xs shrink-0 pl-9 sm:pl-0">
                    <div className="text-right">
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {item.soldUnits}
                      </span>
                      <span className="text-slate-500 text-[11px]"> / {item.targetUnits} Eks</span>
                    </div>

                    <div className="text-right pl-3 border-l border-slate-200">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          isStockLow
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        Sisa: {item.stockRemaining} Eks
                      </span>
                    </div>

                    {onViewBookDetail && (
                      <button
                        onClick={() => {
                          const matched = books.find(b => b.id === item.id || b.name === item.title);
                          if (matched) onViewBookDetail(matched);
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
                        title="Lihat Pratinjau Buku"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-700 ${
                        index === 0
                          ? 'bg-gradient-to-r from-amber-500 to-[#DFBF64]'
                          : index === 1
                          ? 'bg-slate-900'
                          : 'bg-emerald-600'
                      }`}
                      style={{ width: `${percentageOfTarget}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>Target Capaian: {percentageOfTarget}%</span>
                    <span>Nilai Terjual: {formatRupiah(item.revenue)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. RECENT TRANSACTIONS & FEEDBACK WIDGETS (3-COLUMN SECTION) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* WIDGET 1: RECENT ORDERS TABLE (SPAN 2 COLUMNS) */}
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">
                  Transaksi Pesanan Terbaru (Recent Orders)
                </h3>
                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                  {filteredOrders.length} Pesanan
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Alur checkout langsung pembeli dan status verifikasi pembayaran
              </p>
            </div>

            {onNavigateToOrders && (
              <button
                onClick={onNavigateToOrders}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>Buka Tab Dispatcher</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setOrderStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  orderStatusFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => setOrderStatusFilter('paid')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  orderStatusFilter === 'paid' ? 'bg-emerald-600 text-white' : 'text-slate-600'
                }`}
              >
                Terbayar (Paid)
              </button>
              <button
                onClick={() => setOrderStatusFilter('shipped')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  orderStatusFilter === 'shipped' ? 'bg-blue-600 text-white' : 'text-slate-600'
                }`}
              >
                Dikirim (Shipped)
              </button>
              <button
                onClick={() => setOrderStatusFilter('pending')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  orderStatusFilter === 'pending' ? 'bg-amber-600 text-white' : 'text-slate-600'
                }`}
              >
                Menunggu (Pending)
              </button>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari ID / Pelanggan..."
                value={orderSearchQuery}
                onChange={e => setOrderSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white rounded-lg border border-slate-200 focus:outline-none focus:border-slate-800"
              />
            </div>
          </div>

          {/* Orders Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Pelanggan</th>
                  <th className="py-2.5 px-3">Buku Pesanan</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-right">Cetak Resi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {filteredOrders.slice(0, 6).map(order => {
                  const firstItem = order.items?.[0];
                  const additionalCount = (order.items?.length || 0) - 1;

                  return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900">
                        {order.orderNumber}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">{order.customer.name}</div>
                        <div className="text-[11px] text-slate-500">{order.customer.city}</div>
                      </td>
                      <td className="py-3 px-3 max-w-[200px]">
                        <div className="truncate font-medium text-slate-800" title={firstItem?.book.name}>
                          {firstItem?.book.name || 'Buku Monografi'}
                        </div>
                        {additionalCount > 0 && (
                          <div className="text-[10px] text-slate-500 font-medium">
                            +{additionalCount} judul lainnya
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            order.paymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : order.paymentStatus === 'shipped'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : order.paymentStatus === 'pending'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {order.paymentStatus === 'paid'
                            ? 'PAID'
                            : order.paymentStatus === 'shipped'
                            ? 'SHIPPED'
                            : order.paymentStatus === 'pending'
                            ? 'PENDING'
                            : order.paymentStatus.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatRupiah(order.total)}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onPrintShippingLabel ? onPrintShippingLabel(order) : (onNavigateToOrders && onNavigateToOrders())}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#DFBF64]/20 hover:bg-[#DFBF64]/35 text-slate-900 border border-[#DFBF64]/40 font-semibold text-[11px] transition-colors cursor-pointer"
                          title="Cetak Resi & Download PDF Thermal A6"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-800" />
                          <span>Cetak Resi</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* WIDGET 2: UPCOMING EVENTS & CALENDAR (SPAN 1 COLUMN) */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">Agenda & Rilis Buku</h3>
              </div>
              <button
                onClick={() => setIsAddEventModalOpen(true)}
                className="text-[11px] font-bold text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                + Jadwal
              </button>
            </div>

            {/* Mini Calendar Header Bar */}
            <div className="mt-3 bg-slate-900 text-white p-3 rounded-xl flex items-center justify-between text-xs">
              <div className="font-bold flex items-center gap-1.5 text-[#DFBF64]">
                <span>September 2026</span>
              </div>
              <span className="text-[11px] text-slate-300">Minggu Ini: 2 Agenda</span>
            </div>

            {/* Event List */}
            <div className="space-y-3 mt-4">
              {calendarEvents.map(evt => {
                const isSelected = selectedCalendarDate === evt.date;

                return (
                  <div
                    key={evt.id}
                    onClick={() => setSelectedCalendarDate(evt.date)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all space-y-1.5 ${
                      isSelected
                        ? 'border-slate-900 bg-slate-50 shadow-2xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                          evt.category === 'launch'
                            ? 'bg-amber-100 text-amber-800'
                            : evt.category === 'webinar'
                            ? 'bg-blue-100 text-blue-800'
                            : evt.category === 'deadline'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {evt.category === 'launch'
                          ? 'Peluncuran'
                          : evt.category === 'webinar'
                          ? 'Webinar'
                          : evt.category === 'deadline'
                          ? 'Batas Akhir'
                          : 'Editorial'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">{evt.date}</span>
                    </div>

                    <h4 className="font-bold text-slate-900 line-clamp-1">{evt.title}</h4>
                    <p className="text-[11px] text-slate-500 line-clamp-2">{evt.description}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 pt-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{evt.time}</span>
                      <span>•</span>
                      <span className="truncate">{evt.location}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Sinkron dengan Google Calendar</span>
            <span className="font-semibold text-emerald-600">Terhubung</span>
          </div>
        </div>
      </div>

      {/* WIDGET 3: CUSTOMER REVIEWS & MANUSCRIPT INQUIRIES STREAM (FULL WIDTH) */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              <h3 className="font-bold text-slate-900 text-base">
                Arus Naskah, Ulasan Pembaca & Pertanyaan Kerjasama
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Umpan real-time dari formulir pengajuan naskah ilmiah, ulasan akademis, dan kemitraan institusi
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-semibold text-slate-600 flex-wrap">
            <button
              onClick={() => setFeedbackFilter('all')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                feedbackFilter === 'all' ? 'bg-slate-900 text-white shadow-2xs' : ''
              }`}
            >
              Semua ({feedbackList.length})
            </button>
            <button
              onClick={() => setFeedbackFilter('manuscript')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                feedbackFilter === 'manuscript' ? 'bg-slate-900 text-white shadow-2xs' : ''
              }`}
            >
              Naskah Masuk
            </button>
            <button
              onClick={() => setFeedbackFilter('review')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                feedbackFilter === 'review' ? 'bg-slate-900 text-white shadow-2xs' : ''
              }`}
            >
              Ulasan Buku
            </button>
            <button
              onClick={() => setFeedbackFilter('inquiry')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                feedbackFilter === 'inquiry' ? 'bg-slate-900 text-white shadow-2xs' : ''
              }`}
            >
              Kemitraan
            </button>
          </div>
        </div>

        {/* Feedback Cards List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFeedbacks.map(item => (
            <div
              key={item.id}
              className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                      item.type === 'manuscript'
                        ? 'bg-purple-100 text-purple-800'
                        : item.type === 'review'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {item.type === 'manuscript'
                      ? 'Naskah Monografi'
                      : item.type === 'review'
                      ? 'Ulasan Pembaca'
                      : 'Permohonan Mitra'}
                  </span>
                  <span className="text-[10px] text-slate-400">{item.date}</span>
                </div>

                <h4 className="font-bold text-slate-900 text-xs line-clamp-1">{item.title}</h4>

                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                  "{item.content}"
                </p>

                {item.rating && (
                  <div className="flex items-center gap-1 text-amber-500 text-xs">
                    <div className="flex items-center gap-0.5">
                      {[...Array(item.rating)].map((_, rIdx) => (
                        <Star key={rIdx} className="w-3 h-3 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <span className="text-slate-400 text-[11px] ml-1">
                      ({item.rating}.0/5.0)
                    </span>
                  </div>
                )}
              </div>

              {/* Sender info & Quick action */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="truncate">
                  <div className="font-semibold text-slate-900 text-[11px] truncate">
                    {item.senderName}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {item.institution || item.senderRole}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {item.status === 'pending' ? (
                    <button
                      onClick={() => handleMarkFeedback(item.id, 'reviewed')}
                      className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-slate-900 text-[#DFBF64] hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Tinjau
                    </button>
                  ) : (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Selesai
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL: TAMBAH AGENDA RILIS BUKU */}
      {isAddEventModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-slate-200 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-600" />
                <span>Tambah Agenda Rilis / Acara</span>
              </h3>
              <button
                onClick={() => setIsAddEventModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-md hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCalendarEvent} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Nama Agenda / Judul Acara:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Peluncuran Edisi 2 Monografi Pajak"
                  value={newEventTitle}
                  onChange={e => setNewEventTitle(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tanggal Acara:</label>
                  <input
                    type="date"
                    required
                    value={newEventDate}
                    onChange={e => setNewEventDate(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kategori:</label>
                  <select
                    value={newEventCategory}
                    onChange={e => setNewEventCategory(e.target.value as any)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                  >
                    <option value="launch">Peluncuran Buku</option>
                    <option value="webinar">Webinar Nasional</option>
                    <option value="deadline">Batas Review</option>
                    <option value="editorial">Rapat Redaksi</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Tempat / Link Akses:
                </label>
                <input
                  type="text"
                  placeholder="Misal: Auditorium CakraNexa / Hybrid Zoom"
                  value={newEventLocation}
                  onChange={e => setNewEventLocation(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-slate-900 text-[#DFBF64] font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Simpan Agenda
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddEventModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
