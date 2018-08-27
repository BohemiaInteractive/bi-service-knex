const _          = require('lodash');
const path       = require('path');
const Knex       = require('knex');
const semver     = require('semver');

module.exports = knexBuilder;

const debug = getDebugStrategy();

/**
 * @param {Object}   options - knex options object
 * @param {String}   options.connection.db - a non-standard alias for `options.connection.database`
 * @param {String}   options.connection.database
 * @param {String}   options.connection.username - a non-standard alias for `options.connection.user`
 * @param {String}   options.connection.user
 * @param {String}   options.connection.password
 * @param {String}   options.connection.host
 * @param {Integer}  options.connection.port
 * @param {Integer}  options.pool.max
 * @param {Integer}  options.pool.min
 * @param {Integer}  options.pool.idle
 * @param {Integer}  options.dialect - a non-standard alias for `options.client`
 * @param {String}   options.client - mysql|pg|postgres|postgresql|sqlite3|sqlite|mariadb|mariasql|maria ^
 * @param {String}   [options.version] - version string in semver format
 * @param {Boolean}  [options.debug=false]
 *
 * @return {Bookshelf}
 */
function knexBuilder(options) {

    var defaults = {
        pool: {
            max: 10,
            min: 0,
            idle: 10000
        },
        debug: debug
    };

    options = _.merge(defaults, options);

    //resolve database name
    let database = _.compact([
        _.get(options, ['connection', 'database']),
        _.get(options, ['connection', 'db'])
    ]);

    if (database[0] & database[1]) {
        throw new Error(`Both 'connection.database' option and 'connection.db' alias can NOT be set.`);
    } else {
        database = database.shift();
    }

    //resolve user name
    let user = _.compact([
        _.get(options, ['connection', 'user']),
        _.get(options, ['connection', 'username'])
    ]);

    if (user[0] & user[1]) {
        throw new Error(`Both 'connection.user' option and 'connection.username' alias can NOT be set.`);
    } else {
        user = user.shift();
    }

    //resolve sql dialect
    let dialect = _.compact([
        _.get(options, ['client']),
        _.get(options, ['dialect'])
    ]);

    if (dialect[0] & dialect[1]) {
        throw new Error(`Both 'client' option and 'dialect' alias can NOT be set.`);
    } else {
        dialect = dialect.shift();
    }

    //
    _.set(options, ['connection', 'user'], user);
    _.set(options, ['connection', 'database'], database);
    _.set(options, ['client'], dialect);

    //remove non-standard aliases
    if (options.connection) {
        delete options.connection.username;
        delete options.connection.db;
    }
    delete options.dialect;

    const knex = Knex(options);

    if (options.version) {
        knex.minServerVersion = options.version;
    }

    knex.inspectIntegrity = inspectIntegrity;

    return knex;
}

knexBuilder.Knex = Knex;

/**
 * @return {Boolean|Function}
 */
function getDebugStrategy() {
    var env = process.env;
    var possibleValues = [1,0,true,false];

    if (env.SQL_DEBUG === undefined || env.SQL_DEBUG === '') {
        return false;
    }

    try {
        var parsedDebugEnv = JSON.parse(env.SQL_DEBUG);
        var valueIndex = possibleValues.indexOf(parsedDebugEnv);

        if (valueIndex === -1) {
            throw new SyntaxError;
        } else if (possibleValues[valueIndex]) {
            return true;
        } else {
            return false;
        }
    } catch(e) {
        console.warn('Failed to parse SQL_DEBUG environment variable. Thus the option is disabled. Expects boolean value which can also be represented by 0/1 integer values.');
    }
}

/**
 * @return {Promise<Boolean>}
 */
function inspectIntegrity() {
    const dialect = this.knex.client.dialect;
    let q = void 0;

    switch (dialect) {
        case 'postgres':
        case 'postgresql':
            q='SHOW server_version;';
            break;
        case 'mysql':
        case 'mariadb':
            q='SELECT VERSION() as server_version;';
            break;
        default:
            throw new Error('Integrity check - unsupported dialect');
    }

    return this.knex.raw(q).bind(this).then(function (result) {
        var requiredVer = this.minServerVersion;
        var currentVer = result.rows[0]['server_version'];

        if (   requiredVer
            && semver.valid(requiredVer)
            && semver.lt(currentVer, requiredVer)
        ) {
            throw new Error(`Requires ${dialect.toUpperCase()} version >= ${requiredVer}`);
        }

        return true;
    });
};