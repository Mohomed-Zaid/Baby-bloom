import dayjs, { type ConfigType } from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

export const BUSINESS_TIMEZONE = 'Asia/Colombo'

export const colomboNow = () => dayjs().tz(BUSINESS_TIMEZONE)
export const toColomboDate = (value: ConfigType) => dayjs(value).tz(BUSINESS_TIMEZONE)
export const formatBusinessDate = (value: ConfigType, pattern = 'DD MMM YYYY') =>
  toColomboDate(value).format(pattern)