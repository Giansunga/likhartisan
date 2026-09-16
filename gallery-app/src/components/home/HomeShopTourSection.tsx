const SHOP_TOUR_VIDEO = 'https://www.youtube-nocookie.com/embed/yrfUUl-jhAQ';

export default function HomeShopTourSection() {
  return (
    <section className="home-section home-shop-tour" aria-labelledby="home-shop-tour-title">
      <div className="home-container">
        <div className="home-shop-tour__intro">
          <div className="home-section-heading home-shop-tour__heading">
            <span>Watch the craft unfold</span>
            <h2 id="home-shop-tour-title" aria-label="A Tour of Santo Tomas: Inside the Shops">A Tour of Santo Tomas: <em>Inside the Shops</em></h2>
          </div>
        </div>
        <div className="home-shop-tour__video-wrap">
          <div className="home-shop-tour__frame">
            <iframe
              src={SHOP_TOUR_VIDEO}
              title="A Tour of Santo Tomas: Inside the Shops"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <p className="home-shop-tour__caption">A short film from the pottery capital of the Philippines</p>
        </div>
      </div>
    </section>
  );
}
