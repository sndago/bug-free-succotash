const required = ['MONGO_URI'];
const requiredInProduction = ['SESSION_SECRET'];

const validate = () => {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production') {
    const missingProd = requiredInProduction.filter((key) => !process.env[key]);
    if (missingProd.length) {
      throw new Error(`Missing required production environment variables: ${missingProd.join(', ')}`);
    }
  }
};

module.exports = { validate };
