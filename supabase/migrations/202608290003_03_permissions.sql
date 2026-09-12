-- Global permission catalogue. Company-specific allowance lives in role_permissions.
with modules(module) as (
  values ('dashboard'), ('customers'), ('vendors'), ('products'), ('inventory'), ('invoices'),
         ('purchases'), ('orders'), ('receivables'), ('payables'), ('cheques'), ('banking'),
         ('accounting'), ('reports'), ('sms'), ('settings'), ('audit')
), actions(action_name) as (
  values ('view'), ('create'), ('update'), ('delete'), ('approve'), ('print'), ('export'),
         ('view_cost'), ('change_price'), ('apply_discount'), ('backdate'), ('reopen'), ('manage_permissions')
)
insert into public.permissions (permission_key, module, name, description)
select module || '.' || action_name, module, initcap(replace(action_name, '_', ' ')),
       'Allows ' || replace(action_name, '_', ' ') || ' operations in ' || module
from modules cross join actions;