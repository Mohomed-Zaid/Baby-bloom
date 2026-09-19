import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envContent = fs.readFileSync('.env', 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const parts = line.split('=')
  if (parts.length >= 2) {
    const k = parts[0].trim()
    const v = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '')
    env[k] = v
  }
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const variantId = '5185938e-11c3-4048-9ab9-3af65d082f6b'
  
  // 1. Check variant details
  const { data: v, error: vErr } = await supabase
    .from('product_variants')
    .select('id, sku, variant_name, product_id, is_active')
    .eq('id', variantId)
    .maybeSingle()
  console.log('Variant:', v, vErr)

  // 2. Check stock movements for this variant
  const { data: m, error: mErr } = await supabase
    .from('stock_movements')
    .select('id, stock_location_id, quantity_in, quantity_out, movement_type, movement_date')
    .eq('product_variant_id', variantId)
  console.log('Stock Movements for variant:', m, mErr)

  // 3. Check current_stock view
  const { data: cs, error: csErr } = await supabase
    .from('current_stock')
    .select('product_variant_id, stock_location_id, quantity_on_hand, available_quantity, branch_id, warehouse_id')
    .eq('product_variant_id', variantId)
  console.log('Current Stock rows for variant:', cs, csErr)

  // 4. Check all stock locations
  const { data: locs } = await supabase
    .from('stock_locations')
    .select('id, name, warehouse_id, branch_id')
  console.log('Stock Locations:', locs)

  // 5. Check all branches
  const { data: brs } = await supabase
    .from('branches')
    .select('id, name')
  console.log('Branches:', brs)

  // 6. Check all warehouses
  const { data: whs } = await supabase
    .from('warehouses')
    .select('id, name, branch_id')
  console.log('Warehouses:', whs)
}

run()
