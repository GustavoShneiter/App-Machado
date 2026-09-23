-- Produtos adicionados na comanda: baixa de estoque e total sempre sincronizados.
begin;

create or replace function public.add_product_to_command(command_id uuid, product_id uuid, item_quantity integer default 1) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command_row public.commands%rowtype; product_row public.products%rowtype; item_id uuid;
begin
  perform public.require_office();
  if item_quantity is null or item_quantity < 1 then raise exception 'Informe uma quantidade válida.'; end if;

  select * into strict command_row from public.commands where id=command_id for update;
  if command_row.status <> 'awaiting_payment' then raise exception 'Conclua o atendimento antes de adicionar produtos.'; end if;

  select * into strict product_row from public.products where id=product_id and active for update;
  if product_row.quantity < item_quantity then raise exception 'Estoque insuficiente para este produto.'; end if;

  select id into item_id from public.command_items where command_id=command_row.id and product_id=product_row.id for update;
  if item_id is null then
    insert into public.command_items(command_id,type,product_id,description,unit_price_cents,quantity,commission_cents)
      values(command_row.id,'product',product_row.id,product_row.name,product_row.sale_price_cents,item_quantity,0)
      returning id into item_id;
  else
    update public.command_items set quantity=quantity+item_quantity where id=item_id;
  end if;

  update public.products set quantity=quantity-item_quantity where id=product_row.id;
  insert into public.stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by)
    values(product_row.id,'sale',-item_quantity,command_row.id,'Adicionado à comanda',auth.uid());

  return jsonb_build_object('id',item_id);
end $$;

revoke all on function public.add_product_to_command(uuid,uuid,integer) from public, anon;
grant execute on function public.add_product_to_command(uuid,uuid,integer) to authenticated;

commit;
