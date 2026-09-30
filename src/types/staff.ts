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
  role_level: string // e.g. 'LEVEL 1', 'LEVEL 2', 'Sales Manager', 'Cashier', 'Other'
  commission_rate: number
  branch_id: string | null
  is_active: boolean
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
  // Extended eMark fields
  nick_name?: string | null
  nic?: string | null
  dob?: string | null
  gender?: 'MALE' | 'FEMALE' | string
  area?: string | null
  telephone_no?: string | null
  email?: string | null
  sales_in?: boolean
  sales_target?: boolean
  branches?: string[]
  joined_date?: string | null
  department_name?: string | null
  salary_type?: string | null
  vehicle_no?: string | null
  staff_short_key?: string | null
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
  // Extended fields
  nick_name?: string
  nic?: string
  dob?: string
  gender?: string
  area?: string
  telephone_no?: string
  email?: string
  sales_in?: boolean
  sales_target?: boolean
  branches?: string[]
  joined_date?: string
  department_name?: string
  salary_type?: string
  vehicle_no?: string
  staff_short_key?: string
}

export interface UpdateStaffInput extends Partial<CreateStaffInput> {
  id: string
}
