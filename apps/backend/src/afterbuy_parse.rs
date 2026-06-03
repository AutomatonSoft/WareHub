use crate::AfterbuyOrderItemDto;

pub(crate) use crate::afterbuy_kid_parse::parse_afterbuy_kid_matches;
pub(crate) use crate::afterbuy_memo::parse_afterbuy_memo;

pub(crate) fn ensure_non_empty_order_items(
    order_id: &str,
    mut items: Vec<AfterbuyOrderItemDto>,
) -> Vec<AfterbuyOrderItemDto> {
    if items.is_empty() {
        items.push(AfterbuyOrderItemDto {
            article_no: None,
            sku: None,
            ean: None,
            title: format!("Order {order_id}"),
            size: None,
            color: None,
            price: None,
            sale_date: None,
            quantity: 1,
        });
    }
    items
}
