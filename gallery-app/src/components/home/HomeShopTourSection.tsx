import { resolveAssetUrl } from '../../lib/assetDelivery';
const SHOP_TOUR_VIDEO = 'https://pub-0cc6e7109e7e48a183d54d0426453a6a.r2.dev/Landing%20Page%20Video/LikhArtisan%203min.mp4';

export default function HomeShopTourSection() {
  return (
    <section id="home-shop-tour" data-home-section tabIndex={-1} className="home-section home-shop-tour" aria-labelledby="home-shop-tour-title">
      <div className="home-container">
        <div className="home-shop-tour__intro">
          <div className="home-section-heading home-shop-tour__heading">
            <h2 id="home-shop-tour-title" aria-label="A Tour of Santo Tomas: Inside the Shops">A Tour of Santo Tomas: <em>Inside the Shops</em></h2>
          </div>
        </div>
        <div className="home-shop-tour__video-wrap">
          <div className="home-shop-tour__frame">
            <video
              title="A Tour of Santo Tomas: Inside the Shops"
              aria-label="A Tour of Santo Tomas: Inside the Shops"
              controls
              playsInline
              preload="metadata"
            >
              <source src={resolveAssetUrl(SHOP_TOUR_VIDEO)} type="video/mp4" />
              Your browser cannot play this video. <a href={resolveAssetUrl(SHOP_TOUR_VIDEO)}>Open the shop tour video</a>.
            </video>
          </div>
          <p className="home-shop-tour__caption">A short film from the pottery capital of the Philippines</p>
        </div>
      </div>
    </section>
  );
}
