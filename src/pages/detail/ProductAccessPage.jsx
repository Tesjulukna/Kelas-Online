import Icon from '../../components/Icon'

function ProductAccessPage({
  accessState,
  onBack,
  onRetry,
}) {
  const accessData = accessState.data
  const accessProduct = accessData?.product
  const delivery = accessData?.delivery

  return (
    <section className="public-detail-page public-product-access-page">
      <div className="public-access-topbar">
        <button className="icon-action-button" type="button" onClick={onBack}>
          <Icon name="arrowLeft" />
        </button>
      </div>

      <article className="public-checkout-panel public-access-panel">
        <div className="section-heading">
          <p className="eyebrow">Akses produk</p>
          <h2>{accessProduct?.title || 'Produk digital'}</h2>
          <small>{accessData?.message || 'Memeriksa status pembayaran produk digital.'}</small>
        </div>

        {accessState.isLoading && (
          <p className="public-checkout-status">Memuat akses produk...</p>
        )}

        {accessState.error && (
          <div className="public-access-message">
            <Icon name="shield" />
            <h3>Akses belum tersedia</h3>
            <p>{accessState.error}</p>
            <button className="btn btn-secondary" type="button" onClick={onRetry}>
              Cek ulang
            </button>
          </div>
        )}

        {accessData && !accessData.paid && (
          <div className="public-access-message">
            <Icon name="clock" />
            <h3>Pembayaran belum terkonfirmasi</h3>
            <p>{accessData.message}</p>
            <div className="public-access-actions">
              {accessData.checkoutUrl && (
                <a className="btn btn-primary" href={accessData.checkoutUrl}>
                  Lanjutkan Pembayaran
                </a>
              )}
              <button className="btn btn-secondary" type="button" onClick={onRetry}>
                Cek Ulang
              </button>
            </div>
          </div>
        )}

        {accessData?.paid && accessProduct && (
          <div className="public-access-content">
            <div>
              <p className="eyebrow">Produk siap diakses</p>
              <h3>{accessProduct.title}</h3>
              <p>Cek emailmu juga. Kami sudah mengirimkan link akses dan detail produk ke email pembeli.</p>
            </div>

            {delivery?.downloadUrl ? (
              <a className="btn btn-primary public-access-download" href={delivery.downloadUrl}>
                Buka Isi Produk
                <Icon name="arrowRight" />
              </a>
            ) : (
              <p className="public-checkout-status">
                Link produk belum tersedia. Silakan cek email atau hubungi support.
              </p>
            )}

            {delivery?.deliveryNote && (
              <section className="public-detail-section public-access-note">
                <p className="eyebrow">Catatan akses</p>
                <p>{delivery.deliveryNote}</p>
              </section>
            )}
          </div>
        )}
      </article>
    </section>
  )
}

export default ProductAccessPage
