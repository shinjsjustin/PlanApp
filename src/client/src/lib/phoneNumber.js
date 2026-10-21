const NATIONAL_DIGITS = /^1?(\d{3})(\d{3})(\d{4})$/;

export const formatPhone = (number) => {
    const match = number.replace(/\D/g, '').match(NATIONAL_DIGITS);
    return match ? `(${match[1]}) ${match[2]}-${match[3]}` : number.trim();
};
