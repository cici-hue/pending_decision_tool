import { useTranslation } from 'react-i18next'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts'
import { ReportData } from '../App'
import { TrendingUp, FileText, AlertCircle, Award, Calendar } from 'lucide-react'

interface DashboardProps {
  reports: ReportData[]
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export function Dashboard({ reports }: DashboardProps) {
  const { t } = useTranslation()

  // 去重逻辑：以 PO/SPLIT NO.、STYLE NO.、ITEM NO、delivered quantity 作为唯一判定条件
  const uniqueReports = reports.filter((report, index, self) => {
    const key = `${report.poNo}|${report.styleNo}|${report.itemNo}|${report.deliveredQty}`
    const firstIndex = self.findIndex(r => 
      `${r.poNo}|${r.styleNo}|${r.itemNo}|${r.deliveredQty}` === key
    )
    return index === firstIndex
  })

  // 显示去重信息
  const duplicateCount = reports.length - uniqueReports.length

  // 统计数据（使用去重后的数据）
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  
  const monthlyReports = uniqueReports.filter(r => {
    const date = new Date(r.timestamp)
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear
  })

  const pendingCount = uniqueReports.filter(r => !r.emailSent).length
  const totalReports = uniqueReports.length

  // 疵点类型统计（使用去重后的数据）
  const defectTypeStats = uniqueReports.reduce((acc, report) => {
    report.defectDetails.forEach(defect => {
      const type = defect.description
      acc[type] = (acc[type] || 0) + defect.count
    })
    return acc
  }, {} as Record<string, number>)

  const defectTypeData = Object.entries(defectTypeStats)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // 帕累托图数据：计算累计百分比
  const totalDefectsValue = defectTypeData.reduce((sum, d) => sum + d.value, 0)
  let cumulativeValue = 0
  const paretoData = defectTypeData.map((item, index) => {
    cumulativeValue += item.value
    return {
      name: item.name,
      value: item.value,
      cumulative: ((cumulativeValue / totalDefectsValue) * 100).toFixed(1)
    }
  })

  // 供应商评分（使用去重后的数据）
  const supplierStats = uniqueReports.reduce((acc, report) => {
    const vendor = report.vendor || 'Unknown'
    if (!acc[vendor]) {
      acc[vendor] = { total: 0, defects: 0, reports: 0 }
    }
    acc[vendor].total += report.inspectionQty || 0
    acc[vendor].defects += report.defectDetails.reduce((sum, d) => sum + d.count, 0)
    acc[vendor].reports += 1
    return acc
  }, {} as Record<string, { total: number; defects: number; reports: number }>)

  const supplierData = Object.entries(supplierStats)
    .map(([name, stats]) => ({
      name,
      defectRate: stats.total > 0 ? ((stats.defects / stats.total) * 100).toFixed(2) : '0',
      reports: stats.reports,
      totalQty: stats.total
    }))
    .sort((a, b) => parseFloat(b.defectRate) - parseFloat(a.defectRate))
    .slice(0, 10)

  // 客户问题统计（使用去重后的数据）
  const customerStats = uniqueReports.reduce((acc, report) => {
    const customer = report.customer || 'Unknown'
    if (!acc[customer]) {
      acc[customer] = { reports: 0, issues: 0 }
    }
    acc[customer].reports += 1
    acc[customer].issues += report.defectDetails.length
    return acc
  }, {} as Record<string, { reports: number; issues: number }>)

  const customerData = Object.entries(customerStats)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.issues - a.issues)
    .slice(0, 10)

  // 月度趋势（最近6个月，使用去重后的数据）
  const monthlyTrend = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthReports = uniqueReports.filter(r => {
      const reportDate = new Date(r.timestamp)
      return reportDate.getFullYear() === d.getFullYear() && 
             reportDate.getMonth() === d.getMonth()
    })
    const monthDefects = monthReports.reduce((sum, r) => 
      sum + r.defectDetails.reduce((dSum, d) => dSum + d.count, 0), 0
    )
    monthlyTrend.push({
      month: `${d.getMonth() + 1}月`,
      reports: monthReports.length,
      defects: monthDefects
    })
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-slate-400 text-sm">本月处理报告</span>
          </div>
          <p className="text-2xl font-bold text-white">{monthlyReports.length}</p>
          <p className="text-xs text-slate-500 mt-1">总计: {totalReports}</p>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
            </div>
            <span className="text-slate-400 text-sm">待处理</span>
          </div>
          <p className="text-2xl font-bold text-white">{pendingCount}</p>
          <p className="text-xs text-slate-500 mt-1">已发送: {totalReports - pendingCount}</p>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-red-400" />
            </div>
            <span className="text-slate-400 text-sm">总疵点数</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {uniqueReports.reduce((sum, r) => sum + r.defectDetails.reduce((dSum, d) => dSum + d.count, 0), 0)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            平均: {totalReports > 0 ? (uniqueReports.reduce((sum, r) => sum + r.defectDetails.length, 0) / totalReports).toFixed(1) : 0} 类型/报告
          </p>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Award className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-slate-400 text-sm">供应商数量</span>
          </div>
          <p className="text-2xl font-bold text-white">{Object.keys(supplierStats).length}</p>
          <p className="text-xs text-slate-500 mt-1">
            客户: {Object.keys(customerStats).length} 
            {duplicateCount > 0 && <span className="text-yellow-400 ml-2">去重: -{duplicateCount}</span>}
          </p>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 疵点类型分布 - 帕累托图 */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            疵点类型帕累托分析（Top 10）
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={paretoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="name" 
                  stroke="#9CA3AF" 
                  angle={-45} 
                  textAnchor="end" 
                  height={80} 
                  fontSize={10}
                />
                <YAxis 
                  yAxisId="left" 
                  stroke="#9CA3AF" 
                  label={{ value: '数量', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="#9CA3AF"
                  label={{ value: '累计百分比 (%)', angle: 90, position: 'insideRight', fill: '#9CA3AF' }}
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value: any, name: string) => {
                    if (name === '累计百分比') return [`${value}%`, name]
                    return [value, '数量']
                  }}
                />
                <Legend />
                <Bar 
                  yAxisId="left" 
                  dataKey="value" 
                  fill="#3B82F6" 
                  name="疵点数量"
                  barSize={30}
                />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="cumulative" 
                  stroke="#EF4444" 
                  strokeWidth={2}
                  dot={{ fill: '#EF4444', r: 4 }}
                  name="累计百分比"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 月度趋势 */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-green-400" />
            近 6 个月报告数量 vs 瑕疵数量趋势
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="month" 
                  stroke="#9CA3AF"
                  label={{ value: '月份', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
                />
                <YAxis 
                  stroke="#9CA3AF"
                  label={{ value: '数量', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                />
                <Legend />
                <Line type="monotone" dataKey="reports" stroke="#3B82F6" name="报告数量" />
                <Line type="monotone" dataKey="defects" stroke="#EF4444" name="疵点数量" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 供应商质量评分 */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-400" />
            供应商疵点率排行（Top 10）
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supplierData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9CA3AF" />
                <YAxis dataKey="name" type="category" width={120} stroke="#9CA3AF" fontSize={11} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value: number) => [`${value}%`, '疵点率']}
                />
                <Bar dataKey="defectRate" fill="#F59E0B" name="疵点率 (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 客户问题统计 */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-400" />
            客户问题统计（Top 10）
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={customerData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9CA3AF" angle={-45} textAnchor="end" height={80} fontSize={10} />
                <YAxis stroke="#9CA3AF" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                />
                <Legend />
                <Bar dataKey="reports" fill="#3B82F6" name="报告数" />
                <Bar dataKey="issues" fill="#EF4444" name="问题数" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 详细数据表格 */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4">疵点详情统计</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 text-slate-400">疵点类型</th>
                <th className="text-right py-3 px-4 text-slate-400">出现次数</th>
                <th className="text-right py-3 px-4 text-slate-400">占比</th>
                <th className="text-left py-3 px-4 text-slate-400">趋势</th>
              </tr>
            </thead>
            <tbody>
              {defectTypeData.map((defect, index) => {
                const totalDefects = defectTypeData.reduce((sum, d) => sum + d.value, 0)
                const percentage = ((defect.value / totalDefects) * 100).toFixed(1)
                return (
                  <tr key={defect.name} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-3 px-4">
                      <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                      {defect.name}
                    </td>
                    <td className="text-right py-3 px-4 font-medium">{defect.value}</td>
                    <td className="text-right py-3 px-4">{percentage}%</td>
                    <td className="py-3 px-4">
                      <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full" 
                          style={{ width: `${percentage}%`, backgroundColor: COLORS[index % COLORS.length] }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
