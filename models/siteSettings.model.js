import mongoose from "mongoose";

const heroSlideSchema = new mongoose.Schema({
  image: { type: String, required: true },
  badge: { type: String, default: "100% Natural & Organic" },
  title1: { type: String, default: "Dronagiri" },
  title2: { type: String, default: "Farm" },
  tagline: {
    type: String,
    default:
      "From our fields to your kitchen — pure, unprocessed, farm-fresh goodness.",
  },
  primaryCtaText: { type: String, default: "🛒 Shop Products" },
  primaryCtaLink: { type: String, default: "/products" },
  secondaryCtaText: { type: String, default: "Our Story ↓" },
  secondaryCtaLink: { type: String, default: "/about" },
});

const founderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, default: "Co-Founder" },
  title: { type: String, default: "" },
  qualification: { type: String, default: "" },
  location: { type: String, default: "" },
  image: { type: String, default: "" },
  badgeClass: { type: String, default: "bg-[#8C6A43] text-white" },
  paragraphs: [{ type: String }],
  quote: { type: String, default: "" },
  youtubeUrl: { type: String, default: "" },
  instagramUrl: { type: String, default: "" },
});

const pageHeroSchema = new mongoose.Schema({
  image: { type: String, default: "" },
  badge: { type: String, default: "" },
  heading: { type: String, default: "" },
  paragraph: { type: String, default: "" },
});

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    logoUrl: { type: String, default: "/logo2.png" },
    whatsappNumber: { type: String, default: "+91 99999 99999" },
    phoneNumber: { type: String, default: "+91 99999 99999" },
    address: { type: String, default: "Dronagiri, Maharashtra, India" },
    instagramUrl: {
      type: String,
      default:
        "https://www.instagram.com/dronagiri_farms?stkn=MW56NTE5dWZ0ZWhreg%3D%3D&utm_source=qr",
    },
    youtubeUrl: {
      type: String,
      default: "https://youtube.com/@thenitesh1989?si=ujvjHrIab8OhW2VG",
    },
    heroSlides: [heroSlideSchema],
    founders: [founderSchema],
    productsHero: {
      type: pageHeroSchema,
      default: () => ({
        image: "/Artboard 2.png",
        badge: "Dronagiri Farm Products",
        heading: "Farm-Fresh Products",
        paragraph:
          "Pure grains, pulses, spices, oils, and natural staples sourced directly from our farm.",
      }),
    },
    aboutHero: {
      type: pageHeroSchema,
      default: () => ({
        image: "/about-hero.jpg",
        badge: "Est. 2018 · Dronagiri Farm",
        heading: "Bringing Pure Organic Goodness From Farm To Your Family",
        paragraph:
          "From the fertile fields of Dronagiri to your dining table — we nurture every seed with love, tradition, and unwavering commitment to purity.",
      }),
    },
  },
  { timestamps: true }
);

const SiteSettings = mongoose.model("SiteSettings", siteSettingsSchema);
export default SiteSettings;
