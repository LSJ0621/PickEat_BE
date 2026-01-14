import {
  Repository,
  SelectQueryBuilder,
  DeleteResult,
  UpdateResult,
  ObjectLiteral,
  EntityManager,
  EntityMetadata,
  EntityTarget,
  QueryRunner,
  DataSource,
} from 'typeorm';
import { QueryExpressionMap } from 'typeorm/query-builder/QueryExpressionMap';

/**
 * Creates a mock TypeORM Repository for testing
 * Includes all common CRUD methods mocked with jest.fn()
 *
 * @example
 * const mockRepository = createMockRepository<User>();
 * mockRepository.findOne.mockResolvedValue(user);
 */
export function createMockRepository<
  T extends ObjectLiteral = ObjectLiteral,
>(): jest.Mocked<Repository<T>> {
  const mockQueryBuilder = createMockQueryBuilder<T>();

  return {
    // Basic CRUD operations
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findOneOrFail: jest.fn(),
    findOneByOrFail: jest.fn(),
    findBy: jest.fn(),
    findAndCount: jest.fn(),
    findAndCountBy: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateAll: jest.fn(),
    delete: jest.fn(),
    deleteAll: jest.fn(),
    remove: jest.fn(),
    softRemove: jest.fn(),
    recover: jest.fn(),
    insert: jest.fn(),
    clear: jest.fn(),
    count: jest.fn(),
    countBy: jest.fn(),
    increment: jest.fn(),
    decrement: jest.fn(),
    exist: jest.fn(),
    exists: jest.fn(),
    existsBy: jest.fn(),

    // Query builder
    createQueryBuilder: jest.fn(() => mockQueryBuilder) as jest.MockedFunction<
      () => SelectQueryBuilder<T>
    >,

    // Manager and metadata (unused in tests but required by Repository interface)
    manager: {} as unknown as EntityManager,
    metadata: {} as unknown as EntityMetadata,
    target: {} as unknown as EntityTarget<T>,
    queryRunner: undefined as unknown as QueryRunner | undefined,

    // Other methods
    extend: jest.fn(),
    restore: jest.fn(),
    softDelete: jest.fn(),
    preload: jest.fn(),
    hasId: jest.fn(),
    getId: jest.fn(),
    merge: jest.fn(),

    // Less commonly used methods
    findByIds: jest.fn() as jest.MockedFunction<
      (ids: unknown[]) => Promise<T[]>
    >,
    findOneById: jest.fn() as jest.MockedFunction<
      (id: unknown) => Promise<T | null>
    >,
    query: jest.fn() as jest.MockedFunction<
      (query: string, parameters?: unknown[]) => Promise<unknown>
    >,
    upsert: jest.fn(),
    sum: jest.fn() as jest.MockedFunction<
      (columnName: string) => Promise<number>
    >,
    average: jest.fn() as jest.MockedFunction<
      (columnName: string) => Promise<number>
    >,
    minimum: jest.fn() as jest.MockedFunction<
      (columnName: string) => Promise<number | string | null>
    >,
    maximum: jest.fn() as jest.MockedFunction<
      (columnName: string) => Promise<number | string | null>
    >,
    sql: jest.fn() as jest.MockedFunction<
      <S = unknown>(
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => Promise<S>
    >,
  } as unknown as jest.Mocked<Repository<T>>;
}

/**
 * Creates a mock TypeORM QueryBuilder for testing
 * Useful when testing complex queries with joins, where clauses, etc.
 *
 * @example
 * const mockQueryBuilder = createMockQueryBuilder<User>();
 * mockQueryBuilder.getOne.mockResolvedValue(user);
 */
export function createMockQueryBuilder<
  T extends ObjectLiteral = ObjectLiteral,
>(): jest.Mocked<SelectQueryBuilder<T>> {
  const mockQueryBuilder: Partial<jest.Mocked<SelectQueryBuilder<T>>> = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    andHaving: jest.fn().mockReturnThis(),
    orHaving: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndMapOne: jest.fn().mockReturnThis(),
    leftJoinAndMapMany: jest.fn().mockReturnThis(),
    innerJoinAndMapOne: jest.fn().mockReturnThis(),
    innerJoinAndMapMany: jest.fn().mockReturnThis(),
    loadRelationIdAndMap: jest.fn().mockReturnThis(),
    loadAllRelationIds: jest.fn().mockReturnThis(),
    subQuery: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    setFindOptions: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    useTransaction: jest.fn().mockReturnThis(),

    // Execution methods
    getOne: jest.fn(),
    getOneOrFail: jest.fn(),
    getMany: jest.fn(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
    getCount: jest.fn(),
    getManyAndCount: jest.fn(),
    getRawAndEntities: jest.fn(),
    execute: jest.fn(),
    stream: jest.fn(),

    // Update/Delete methods
    update: jest.fn(),
    delete: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
    insert: jest.fn(),

    // Clone
    clone: jest.fn().mockReturnThis(),

    // Expression
    expressionMap: {} as unknown as QueryExpressionMap,
    connection: {} as unknown as DataSource,
  };

  return mockQueryBuilder as jest.Mocked<SelectQueryBuilder<T>>;
}

/**
 * Mock DeleteResult for testing delete operations
 */
export function createMockDeleteResult(affected: number = 1): DeleteResult {
  return {
    affected,
    raw: {},
  };
}

/**
 * Mock UpdateResult for testing update operations
 */
export function createMockUpdateResult(affected: number = 1): UpdateResult {
  return {
    affected,
    raw: {},
    generatedMaps: [],
  };
}
