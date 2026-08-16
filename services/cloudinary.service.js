import { v2 as cloudinary } from 'cloudinary';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

export const uploadTicketPDF = async (pdfBuffer, ticketId) => {
    // ── Input validation ──────────────────────────────────────────────────
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'A non-empty Buffer is required for pdfBuffer.',
        );
    }

    if (!ticketId || typeof ticketId !== 'string' || ticketId.trim() === '') {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'A valid, non-empty ticketId string is required.',
        );
    }

    const sanitizedTicketId = ticketId.trim();

    const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'raw',
                folder: 'TEDX 2026',
                public_id: sanitizedTicketId,
                overwrite: true,
                invalidate: true,
            },
            (error, result) => {
                if (error) {
                    reject(
                        new ApiError(
                            StatusCodes.BAD_GATEWAY,
                            `Cloudinary upload failed: ${error.message}`,
                        ),
                    );
                } else {
                    resolve(result);
                }
            },
        );

        uploadStream.end(pdfBuffer);
    });

    return {
        secureUrl: result.secure_url,
        publicId: result.public_id,
    };
};

export const deleteTicketPDF = async (publicId) => {

    if (!publicId || typeof publicId !== 'string' || publicId.trim() === '') {
        throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'A valid, non-empty publicId string is required.',
        );
    }

    const result = await cloudinary.uploader.destroy(publicId.trim(), {
        resource_type: 'raw',
        invalidate: true,
    });

    if (result.result !== 'ok') {
        throw new ApiError(
            StatusCodes.NOT_FOUND,
            `Cloudinary could not delete resource '${publicId}': ${result.result}`,
        );
    }

    return result;
};
