const TYPE_CHECKERS = {
    string: value => typeof value === 'string',
    number: value => typeof value === 'number' && Number.isFinite(value),
    integer: value => Number.isInteger(value),
    boolean: value => typeof value === 'boolean',
    array: value => Array.isArray(value),
    object: value => value !== null && typeof value === 'object' && !Array.isArray(value)
};

const DEFAULT_MAX_STRING_LENGTH = 2000;

const validateValue = (value, schema, path) => {
    const errors = [];

    if (value === undefined || value === null) return errors;

    const checker = TYPE_CHECKERS[schema.type];
    if (checker && !checker(value)) {
        return [`${path} debe ser ${schema.type}`];
    }

    if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`${path} debe ser uno de: ${schema.enum.join(', ')}`);
    }

    if (schema.type === 'string' && schema.minLength && value.trim().length < schema.minLength) {
        errors.push(`${path} no puede estar vacío`);
    }

    const maxLength = schema.type === 'string'
        ? schema.maxLength || DEFAULT_MAX_STRING_LENGTH
        : null;
    if (maxLength && value.length > maxLength) {
        errors.push(`${path} excede ${maxLength} caracteres`);
    }

    if (schema.type === 'array' && schema.items) {
        value.forEach((item, index) => {
            errors.push(...validateValue(item, schema.items, `${path}[${index}]`));
        });
    }

    if (schema.type === 'object' && schema.properties) {
        errors.push(...validateObject(value, schema, path));
    }

    return errors;
};

const validateObject = (value, schema, path = 'argumentos') => {
    const errors = [];
    const required = schema.required || [];

    if (!TYPE_CHECKERS.object(value)) {
        return [`${path} debe ser object`];
    }

    required.forEach(field => {
        if (value?.[field] === undefined || value?.[field] === null || value?.[field] === '') {
            errors.push(`${path}.${field} es requerido`);
        }
    });

    Object.entries(schema.properties || {}).forEach(([field, fieldSchema]) => {
        errors.push(...validateValue(value?.[field], fieldSchema, `${path}.${field}`));
    });

    if (schema.additionalProperties === false) {
        const allowedFields = new Set(Object.keys(schema.properties || {}));
        Object.keys(value).forEach(field => {
            if (!allowedFields.has(field)) {
                errors.push(`${path}.${field} no está permitido`);
            }
        });
    }

    return errors;
};

export const createCommandRegistry = definitions => {
    const commandMap = new Map();

    definitions.forEach(definition => {
        if (!definition?.name || typeof definition.execute !== 'function') {
            throw new Error('Cada comando necesita name y execute');
        }
        if (commandMap.has(definition.name)) {
            throw new Error(`Comando duplicado: ${definition.name}`);
        }
        commandMap.set(definition.name, Object.freeze({ ...definition }));
    });

    const describe = () => [...commandMap.values()].map(command => ({
        name: command.name,
        description: command.description,
        risk: command.risk || 'normal',
        requiresConfirmation: command.requiresConfirmation === true,
        parameters: command.parameters
    }));

    const toModelTools = () => describe().map(command => ({
        type: 'function',
        function: {
            name: command.name,
            description: command.description,
            parameters: command.parameters
        }
    }));

    const execute = async (name, args, context = {}) => {
        const command = commandMap.get(name);
        if (!command) {
            return {
                ok: false,
                code: 'UNKNOWN_COMMAND',
                message: `Comando no registrado: ${name}`
            };
        }

        const validationErrors = validateObject(args || {}, command.parameters || {});
        if (validationErrors.length > 0) {
            return {
                ok: false,
                code: 'INVALID_ARGUMENTS',
                message: validationErrors.join('. '),
                validationErrors
            };
        }

        if (command.requiresConfirmation && context.confirmDestructive !== true) {
            return {
                ok: false,
                code: 'CONFIRMATION_REQUIRED',
                message: command.confirmationMessage?.(args) || `Confirma ejecutar ${name}.`,
                pendingCommand: { name, args }
            };
        }

        return command.execute(args, context);
    };

    return Object.freeze({ describe, execute, toModelTools });
};
