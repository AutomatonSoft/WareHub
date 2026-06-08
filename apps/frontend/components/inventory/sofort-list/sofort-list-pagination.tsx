import { Button } from "@/components/ui/button";

export function SofortListPagination(props: {
  page: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="wh-sofort-pagination">
      <p className="wh-sofort-pagination__label">Page {props.page}</p>
      <div className="wh-sofort-pagination__actions">
        <Button type="button" variant="outline" onClick={props.onPrev} disabled={!props.hasPrevPage} className="wh-sofort-pagination__button">
          Previous
        </Button>
        <Button type="button" variant="outline" onClick={props.onNext} disabled={!props.hasNextPage} className="wh-sofort-pagination__button">
          Next
        </Button>
      </div>
    </div>
  );
}

