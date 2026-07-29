import Icon from './Icon'

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(value) || 0))
}

function getItemPrice(item) {
  const normalPrice = Math.max(0, Math.round(Number(item?.price) || 0))
  const salePrice = Math.max(0, Math.round(Number(item?.salePrice) || 0))

  return salePrice || normalPrice
}

function FeaturedBundleSection({
  eyebrow = 'Paket pilihan',
  title = 'Lebih hemat dengan bundling',
  description = 'Gabungkan beberapa pilihan dalam satu paket dengan harga khusus.',
  fixedPrograms = [],
  percentProgram = null,
  getProgramItems = () => [],
  onOpenFixed = () => {},
  onOpenPercent = () => {},
}) {
  if (!fixedPrograms.length && !percentProgram) {
    return null
  }

  return (
    <section className="catalog-featured-bundles" aria-label={title}>
      <header className="catalog-featured-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span>
          <Icon name="spark" />
          Unggulan
        </span>
      </header>

      <div className="homepage-bundle-grid catalog-featured-bundle-grid">
        {fixedPrograms.map((program) => {
          const items = getProgramItems(program)
          const subtotal = items.reduce((total, item) => total + getItemPrice(item), 0)
          const packagePrice = Math.max(0, Math.round(Number(program.fixedPrice) || 0))
          const saving = Math.max(0, subtotal - packagePrice)
          const savingPercent = subtotal > 0 ? Math.round((saving / subtotal) * 100) : 0

          return (
            <article className="homepage-bundle-card featured-bundle-card" key={program.id}>
              <span className="homepage-bundle-media">
                {program.thumbnail ? <img src={program.thumbnail} alt="" /> : <Icon name="wallet" />}
                <small>{program.badge || 'Paket hemat'}</small>
              </span>
              <div>
                <h3>{program.title}</h3>
                <p>{program.description || 'Paket pilihan dengan isi dan harga khusus.'}</p>
                <span>{items.length} item dalam satu paket</span>
              </div>
              <footer>
                <span className="featured-bundle-price">
                  {saving > 0 && (
                    <small>
                      <s>{formatRupiah(subtotal)}</s>
                      {savingPercent > 0 && <em>Hemat {savingPercent}%</em>}
                    </small>
                  )}
                  <strong>{packagePrice > 0 ? formatRupiah(packagePrice) : 'Gratis'}</strong>
                </span>
                <button className="btn btn-secondary" type="button" onClick={() => onOpenFixed(program)}>
                  Lihat Paket <Icon name="arrowRight" />
                </button>
              </footer>
            </article>
          )
        })}

        {percentProgram && (
          <article className="homepage-bundle-card featured-bundle-card is-custom">
            <span className="homepage-bundle-media">
              <Icon name="spark" />
              <small>{percentProgram.badge || `Diskon ${percentProgram.discountPercent}%`}</small>
            </span>
            <div>
              <h3>Buat Bundlingmu Sendiri</h3>
              <p>Pilih kelas, produk digital, atau prompt yang kamu mau. Potongan dihitung otomatis.</p>
              <span>Minimal pilih {percentProgram.minimumItems} item</span>
            </div>
            <footer>
              <strong>Diskon {percentProgram.discountPercent}%</strong>
              <button className="btn btn-primary" type="button" onClick={() => onOpenPercent(percentProgram)}>
                Buat Bundlingmu <Icon name="arrowRight" />
              </button>
            </footer>
          </article>
        )}
      </div>
    </section>
  )
}

export default FeaturedBundleSection
