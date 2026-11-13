import { AppShell } from "../../components/layout/app-shell";
import { ProductReviewPanel } from "../../components/reviews/product-review-panel";

export default function ProductReviewsPage() {
  return <AppShell titleKey="navProductReviews"><ProductReviewPanel /></AppShell>;
}
