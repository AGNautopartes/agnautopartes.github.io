// packages/shared/types.ts — Tipos compartidos AGN Autopartes

// Order status types
export type OrderStatus =
  | 'Solicitado'
  | 'Cotizado'
  | 'Comprado'
  | 'Tránsito 1 (Prov→Log)'
  | 'Tránsito 2 (Log→EC)'
  | 'En Aduana'
  | 'Entregado'
  | 'Recogido en Local'
  | 'Cancelado';

// Order interface
export interface OrderItem {
  id: string;
  part_name: string;
  part_number?: string;
  quantity: number;
  cost_fob: number;
  supplier_freight: number;
  customs_nationalization: number;
  margin_percent?: number | null;
  sale_price: number;
  price_with_vat: number;
  vendor_name?: string;
  supplier_url?: string;
  tracking_number?: string;
  item_status?: OrderStatus;
  order_date?: string;
  estimated_arrival?: string;
}

export interface Order {
  id: string;
  readable_id?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_ruc?: string;
  customer_cedula?: string;
  vehicle_brand: string;
  vehicle_model: string;
  vehicle_year?: string;
  vin?: string;
  status: OrderStatus;
  part_name: string;
  supplier_url?: string;
  tracking_number?: string;
  estimated_delivery_client?: string;
  notes?: string;
  costo_fob?: number;
  margen_markdown?: number;
  precio_venta?: number;
  comision_vendedor?: number;
  created_at?: string;
  updated_at?: string;
  order_items: OrderItem[];
  financial_summary?: {
    total_costs: number;
    margin_percent: number;
    final_price: number;
  };
}

// Supplier types
export interface Supplier {
  id: string;
  name: string;
  type: 'marketplace' | 'oem' | 'distributor';
  base_url?: string;
  is_active: boolean;
  created_at?: string;
}

export interface SupplierOrder {
  id: string;
  order_item_id: string;
  supplier_id: string;
  external_order_id?: string;
  external_status?: string;
  tracking_number?: string;
  tracking_url?: string;
  raw_response?: unknown;
  last_sync?: string;
  sync_status: 'pending' | 'synced' | 'failed';
  created_at?: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  nextCursor?: string;
  hasMore: boolean;
}

export interface PaginationCursor {
  cursor: string | null;
  hasMore: boolean;
}