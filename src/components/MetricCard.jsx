import Icon from './Icon'

function MetricCard({ icon, label, value, tone = 'default' }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span className="metric-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  )
}

export default MetricCard
