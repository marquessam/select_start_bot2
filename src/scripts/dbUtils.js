import mongoose from 'mongoose';

/**
 * Execute a function within a MongoDB transaction
 * @param {Function} callback - Function to execute within the transaction
 * @returns {Promise<any>} Result of the callback function
 */
export const withTransaction = async (callback) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const result = await callback(session);
        await session.commitTransaction();
        return result;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Execute a database operation with retry logic
 * @param {Function} operation - Database operation to execute
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} retryDelay - Delay between retries in milliseconds
 * @returns {Promise<any>} Result of the operation
 */
export const withRetry = async (operation, maxRetries = 3, retryDelay = 1000) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            // Only retry on specific errors that might be transient
            if (
                error.name === 'MongoNetworkError' ||
                error.name === 'MongoTimeoutError' ||
                (error.code && [11000, 11001, 16500].includes(error.code))
            ) {
                console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
            }
            
            // For other errors or if we've exhausted retries, rethrow
            throw error;
        }
    }
    
    throw lastError;
};

/**
 * Find a document by ID with error handling
 * @param {mongoose.Model} model - Mongoose model
 * @param {string} id - Document ID
 * @param {Object} options - Query options
 * @returns {Promise<mongoose.Document>} Found document
 */
export const findByIdOrThrow = async (model, id, options = {}) => {
    const document = await model.findById(id, options);
    
    if (!document) {
        const error = new Error(`${model.modelName} with ID ${id} not found`);
        error.statusCode = 404;
        throw error;
    }
    
    return document;
};

/**
 * Find a document by query with error handling
 * @param {mongoose.Model} model - Mongoose model
 * @param {Object} query - Query object
 * @param {Object} options - Query options
 * @returns {Promise<mongoose.Document>} Found document
 */
export const findOneOrThrow = async (model, query, options = {}) => {
    const document = await model.findOne(query, options);
    
    if (!document) {
        const error = new Error(`${model.modelName} not found`);
        error.statusCode = 404;
        throw error;
    }
    
    return document;
};

export default {
    withTransaction,
    withRetry,
    findByIdOrThrow,
    findOneOrThrow
};
