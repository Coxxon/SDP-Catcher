/**
 * Converts a 64-bit PTP Clock Identity (EUI-64) to a 48-bit MAC address (MAC-48)
 * by removing the central "FF-FE" bytes.
 * Example: 00-11-22-FF-FE-33-44-55 -> 00:11:22:33:44:55
 */
export const ptpIdToMac = (ptpId: string): string => {
  if (!ptpId || ptpId === '---' || ptpId === 'Unknown') return ptpId;
  
  const norm = ptpId.replace(/:/g, '-').toUpperCase();
  const parts = norm.split('-');
  
  if (parts.length === 8) {
    // Standard EUI-64 to MAC-48 conversion (skip parts[3] and parts[4] which are FF-FE)
    return [parts[0], parts[1], parts[2], parts[5], parts[6], parts[7]].join(':');
  }
  
  // Fallback: just return it formatted with colons if it doesn't look like EUI-64
  return norm.replace(/-/g, ':');
};
