// ═══════════════════════════════════════════════════════════════
// server/services/validators.js — Input Validation
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

const PHONE_REGEX = new RegExp(config.VALIDATION.phoneRegex);
const VALID_ROLES = config.AUTH.roles;
const GOVERNORATE_IDS = new Set(config.REGIONS.governorates.map(g => g.id));
const CATEGORY_IDS = new Set(config.LABOR_CATEGORIES.map(c => c.id));

/**
 * Validate Egyptian phone number
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'رقم الموبايل مطلوب' };
  }
  if (!PHONE_REGEX.test(phone)) {
    return { valid: false, error: 'رقم الموبايل غير صحيح. الصيغة: 01XXXXXXXXX' };
  }
  return { valid: true };
}

/**
 * Validate OTP code
 */
export function validateOtp(otp) {
  if (!otp || typeof otp !== 'string') {
    return { valid: false, error: 'كود التحقق مطلوب' };
  }
  const otpRegex = new RegExp(`^\\d{${config.AUTH.otpLength}}$`);
  if (!otpRegex.test(otp)) {
    return { valid: false, error: `كود التحقق لازم يكون ${config.AUTH.otpLength} أرقام` };
  }
  return { valid: true };
}

/**
 * Validate role
 */
export function validateRole(role) {
  if (!role || typeof role !== 'string') {
    return { valid: false, error: 'نوع المستخدم مطلوب' };
  }
  if (!VALID_ROLES.includes(role)) {
    return { valid: false, error: `نوع المستخدم غير صحيح. الأنواع المسموحة: ${VALID_ROLES.join(', ')}` };
  }
  return { valid: true };
}

/**
 * Validate governorate
 */
export function validateGovernorate(gov) {
  if (!gov || typeof gov !== 'string') {
    return { valid: false, error: 'المحافظة مطلوبة' };
  }
  if (!GOVERNORATE_IDS.has(gov)) {
    return { valid: false, error: 'المحافظة غير موجودة' };
  }
  return { valid: true };
}

/**
 * Validate category
 */
export function validateCategory(cat) {
  if (!cat || typeof cat !== 'string') {
    return { valid: false, error: 'التخصص مطلوب' };
  }
  if (!CATEGORY_IDS.has(cat)) {
    return { valid: false, error: 'التخصص غير موجود' };
  }
  return { valid: true };
}

/**
 * Validate daily wage
 */
export function validateDailyWage(wage) {
  if (wage == null || typeof wage !== 'number') {
    return { valid: false, error: 'اليومية مطلوبة ولازم تكون رقم' };
  }
  if (wage < config.FINANCIALS.minDailyWage || wage > config.FINANCIALS.maxDailyWage) {
    return { valid: false, error: `اليومية لازم تكون بين ${config.FINANCIALS.minDailyWage} و ${config.FINANCIALS.maxDailyWage} جنيه` };
  }
  return { valid: true };
}

/**
 * Validate profile fields (name, governorate, categories)
 */
export function validateProfileFields(body, role) {
  const errors = [];

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < config.VALIDATION.nameMinLength) {
      errors.push(`الاسم لازم يكون على الأقل ${config.VALIDATION.nameMinLength} حروف`);
    }
    if (typeof body.name === 'string' && body.name.trim().length > config.VALIDATION.nameMaxLength) {
      errors.push(`الاسم لازم يكون أقل من ${config.VALIDATION.nameMaxLength} حرف`);
    }
  }

  if (body.governorate !== undefined) {
    const govResult = validateGovernorate(body.governorate);
    if (!govResult.valid) errors.push(govResult.error);
  }

  if (body.categories !== undefined) {
    if (!Array.isArray(body.categories)) {
      errors.push('التخصصات لازم تكون مصفوفة');
    } else {
      for (const cat of body.categories) {
        const catResult = validateCategory(cat);
        if (!catResult.valid) errors.push(catResult.error);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

/**
 * Validate job creation fields
 */
export function validateJobFields(body) {
  const errors = [];

  // title
  if (!body.title || typeof body.title !== 'string') {
    errors.push('عنوان الفرصة مطلوب');
  } else if (body.title.trim().length < config.VALIDATION.titleMinLength) {
    errors.push(`العنوان لازم يكون على الأقل ${config.VALIDATION.titleMinLength} حروف`);
  } else if (body.title.trim().length > config.VALIDATION.titleMaxLength) {
    errors.push(`العنوان لازم يكون أقل من ${config.VALIDATION.titleMaxLength} حرف`);
  }

  // category
  if (!body.category) {
    errors.push('التخصص مطلوب');
  } else {
    const catResult = validateCategory(body.category);
    if (!catResult.valid) errors.push(catResult.error);
  }

  // governorate
  if (!body.governorate) {
    errors.push('المحافظة مطلوبة');
  } else {
    const govResult = validateGovernorate(body.governorate);
    if (!govResult.valid) errors.push(govResult.error);
  }

  // workersNeeded
  if (body.workersNeeded == null || typeof body.workersNeeded !== 'number') {
    errors.push('عدد العمال المطلوبين لازم يكون رقم');
  } else {
    // Integer enforcement — silently truncate decimals
    body.workersNeeded = Math.floor(body.workersNeeded);
    if (body.workersNeeded < config.JOBS.minWorkersPerJob || body.workersNeeded > config.JOBS.maxWorkersPerJob) {
      errors.push(`عدد العمال لازم يكون بين ${config.JOBS.minWorkersPerJob} و ${config.JOBS.maxWorkersPerJob}`);
    }
  }

  // dailyWage
  if (body.dailyWage == null) {
    errors.push('اليومية مطلوبة');
  } else {
    const wageResult = validateDailyWage(body.dailyWage);
    if (!wageResult.valid) errors.push(wageResult.error);
  }

  // startDate
  if (!body.startDate || typeof body.startDate !== 'string') {
    errors.push('تاريخ البدء مطلوب');
  } else {
    // Validate startDate is today or future (Egypt timezone approximation: UTC+2)
    const egyptNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const todayEgypt = egyptNow.toISOString().split('T')[0];
    if (body.startDate < todayEgypt) {
      errors.push('تاريخ البدء لازم يكون النهارده أو بعد كده');
    }
  }

  // durationDays
  if (body.durationDays == null || typeof body.durationDays !== 'number') {
    errors.push('مدة العمل بالأيام مطلوبة');
  } else {
    // Integer enforcement — silently truncate decimals
    body.durationDays = Math.floor(body.durationDays);
    if (body.durationDays < config.VALIDATION.minDurationDays || body.durationDays > config.VALIDATION.maxDurationDays) {
      errors.push(`مدة العمل لازم تكون بين ${config.VALIDATION.minDurationDays} و ${config.VALIDATION.maxDurationDays} يوم`);
    }
  }

  // description (optional but validated if present)
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      errors.push('الوصف لازم يكون نص');
    } else if (body.description.length > config.VALIDATION.descriptionMaxLength) {
      errors.push(`الوصف لازم يكون أقل من ${config.VALIDATION.descriptionMaxLength} حرف`);
    }
  }

  // location (optional in Phase 1)
  if (body.location !== undefined) {
    if (typeof body.location !== 'object' || body.location === null) {
      errors.push('الموقع لازم يكون object فيه lat و lng');
    } else if (typeof body.location.lat !== 'number' || typeof body.location.lng !== 'number') {
      errors.push('الموقع لازم يحتوي على lat و lng كأرقام');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

/**
 * Validate latitude (Egypt range: 22-32)
 * @param {*} lat
 * @returns {{ valid: boolean, error?: string, value?: number }}
 */
export function validateLatitude(lat) {
  if (lat === undefined || lat === null || lat === '') return { valid: true };
  const num = Number(lat);
  if (isNaN(num)) return { valid: false, error: 'خط العرض لازم يكون رقم' };
  if (num < 22 || num > 32) return { valid: false, error: 'خط العرض لازم يكون في نطاق مصر (22-32)' };
  return { valid: true, value: num };
}

/**
 * Validate longitude (Egypt range: 24-37)
 * @param {*} lng
 * @returns {{ valid: boolean, error?: string, value?: number }}
 */
export function validateLongitude(lng) {
  if (lng === undefined || lng === null || lng === '') return { valid: true };
  const num = Number(lng);
  if (isNaN(num)) return { valid: false, error: 'خط الطول لازم يكون رقم' };
  if (num < 24 || num > 37) return { valid: false, error: 'خط الطول لازم يكون في نطاق مصر (24-37)' };
  return { valid: true, value: num };
}
