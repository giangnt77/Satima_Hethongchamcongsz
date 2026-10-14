'use client';

export default function StatsCards({ stats }) {
  const cards = [
    {
      icon: '⏱️',
      value: `${stats.totalHours || 0}h`,
      label: 'Tổng giờ tháng',
      color: 'amber',
    },
    {
      icon: '📅',
      value: stats.totalShifts || 0,
      label: 'Số ca làm',
      color: 'emerald',
    },
    {
      icon: '⚠️',
      value: stats.totalPenalties || 0,
      label: 'Khoản phạt',
      color: 'coral',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className={`glass rounded-2xl p-5 relative overflow-hidden hover:translate-y-[-4px] transition-all duration-300 stat-corner stat-corner-${card.color}`}
        >
          <div className="text-2xl mb-2">{card.icon}</div>
          <div className={`text-2xl font-extrabold mb-1 ${
            card.color === 'amber' ? 'text-amber-400' :
            card.color === 'emerald' ? 'text-emerald-400' :
            'text-[var(--color-coral-400)]'
          }`}>
            {card.value}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide font-semibold">
            {card.label}
          </div>
        </div>
      ))}
    </div>
  );
}
