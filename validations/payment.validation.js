import Joi from 'joi';

const validatePayment = (req, res, next) => {
  const schema = Joi.object({
    bookingId: Joi.string()
      .required()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .messages({
        'any.required': 'Booking ID is required',
        'string.empty': 'Booking ID cannot be empty',
        'string.pattern.base': 'Invalid booking ID format'
      }),
    
    razorpayOrderId: Joi.string()
      .required()
      .pattern(/^order_[A-Za-z0-9]+$/)
      .messages({
        'any.required': 'Razorpay order ID is required',
        'string.empty': 'Razorpay order ID cannot be empty',
        'string.pattern.base': 'Invalid Razorpay order ID format'
      }),
    
    razorpayPaymentId: Joi.string()
      .required()
      .pattern(/^pay_[A-Za-z0-9]+$/)
      .messages({
        'any.required': 'Razorpay payment ID is required',
        'string.empty': 'Razorpay payment ID cannot be empty',
        'string.pattern.base': 'Invalid Razorpay payment ID format'
      }),
    
    razorpaySignature: Joi.string()
      .required()
      .length(64)
      .pattern(/^[a-f0-9]{64}$/)
      .messages({
        'any.required': 'Razorpay signature is required',
        'string.empty': 'Razorpay signature cannot be empty',
        'string.length': 'Razorpay signature must be 64 characters',
        'string.pattern.base': 'Invalid signature format'
      })
  });

  const { error } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map(detail => detail.message)
    });
  }

  next();
};

export default validatePayment;