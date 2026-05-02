# Financial Logic Migration Summary
## AGN Autopartes ERP System

### Overview
This migration implements a Multi-Stage Landed Cost and Markdown-based Margin model replacing the basic cost model in the AGN Autopartes spare parts order system.

### Changes Made

#### 1. API Endpoint Updates (`api/`)
- **create-order.js**: 
  - Added financial calculation utilities (price/margin/VAT calculations)
  - Enhanced item insertion logic to calculate missing financial values
  - Implemented bidirectional calculation protection using flags
  
- **update-order-full.js**:
  - Added same financial calculation utilities
  - Enhanced item synchronization with proper financial value calculation
  
- **get-all-orders.js**:
  - Added integration with the new `order_financial_summary` view
  - Orders now include financial summary data when available
  
- **admin-chat.js**:
  - Enhanced UPDATE_COST action to better handle margin preservation
  - Maintains existing functionality while supporting new financial model

#### 2. Database Schema Changes (SQL Migration)
Created in `migrations/2026-04-26-financial-logic-migration/`:

**add_financial_fields.sql**:
- Enhanced `financials` table with new columns:
  - `fob_cost` (FOB cost)
  - `supplier_freight` (Freight_Supplier)
  - `customs_nationalization` (Customs_Nationalization)
  - `other_expenses` (Other expenses)
  - `margin_percent` (Margin percentage)
  - `price` (Calculated selling price)
  - `price_with_vat` (Price including 15% VAT)
- Added `customs_nationalization` to `order_items` table
- Created comprehensive `order_financial_summary` view with:
  - Total FOB, freight, customs, landed cost
  - Weighted average margin
  - Total price and price with VAT
- Created SQL functions for financial calculations:
  - `calculate_price_from_cost_and_margin`
  - `calculate_margin_from_cost_and_price`
  - `calculate_price_with_vat` (hardcoded 15%)

**rollback_financial_fields.sql**:
- Complete rollback procedure for all changes

#### 3. Key Features Implemented

**Bidirectional Calculation**:
- Price = Cost / (1 - Margin) where Cost = FOB + Freight_Supplier + Customs_Nationalization
- Source of truth: Margin (holding Price constant when Cost changes)
- Circular dependency protection using calculation flags in application layer

**VAT Calculation**:
- Hardcoded 15% VAT as specified: Final_Price_With_VAT = Price × 1.15

**Order Header Aggregation**:
- Implemented via SQL View (per user preference)
- Automatic aggregation of item-level financials to order header
- Ensures data integrity: SUM of item values = Header totals

**Data Precision**:
- 2 decimal places throughout as specified
- DECIMAL(10,2) used for all financial columns
- Application-level rounding to maintain consistency

### Files Modified
1. `api/create-order.js` - Enhanced financial calculation logic
2. `api/update-order-full.js` - Enhanced financial calculation logic
3. `api/get-all-orders.js` - Added financial summary integration
4. `api/admin-chat.js` - Improved UPDATE_COST handling
5. `migrations/2026-04-26-financial-logic-migration/add_financial_fields.sql` - Database schema enhancements
6. `migrations/2026-04-26-financial-logic-migration/rollback_financial_fields.sql` - Rollback procedure

### Implementation Notes
- Maintains backward compatibility with existing field names
- Application handles bidirectional calculation to prevent circular dependencies
- All financial calculations follow the specified precision requirements
- VAT is hardcoded at 15% as requested
- Order header aggregates are calculated via SQL views for consistency

### Next Steps
1. Execute the SQL migration files in Supabase SQL editor
2. Test the updated API endpoints with various financial scenarios
3. Verify bidirectional calculation works correctly
4. Confirm order header aggregates match item sums
5. Validate VAT calculations are applied correctly