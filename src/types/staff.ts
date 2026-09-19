export interface StaffProfile {
  id: string
  company_id: string
  user_id: string | null
  staff_code: string
  first_name: string
  last_name: string | null
  mobile_number: string
  address: string | null
  designation: string
  role_level: string // e.g. 'LEVEL 1', 'Sales Manager', 'Cashier', 'Sales Rep'
  commission_rate: number
  branch_id: string | null
  is_active: boolean
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  // Joined / computed fields
  branch_name?: string
  full_name?: string
}

export interface CreateStaffInput {
  staff_code?: string
  first_name: string
  last_name?: string
  mobile_number: string
  address?: string
  designation: string
  role_level: string
  commission_rate?: number
  branch_id?: string | null
  is_active?: boolean
}

export interface UpdateStaffInput extends Partial<CreateStaffInput> {
  id: string
}
