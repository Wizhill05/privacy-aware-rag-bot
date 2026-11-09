import fs from 'node:fs';
import path from 'node:path';

/**
 * In-Memory OpenFGA-compatible authorization evaluator.
 * Evaluates relationship queries conforming to model.fga:
 * - document.can_view = owner or reader
 * - reader includes [user, department#member, role#assignee]
 * - department.member = [user]
 * - role.assignee = [user]
 */
export class InMemoryFgaEvaluator {
  constructor(initialTuples = []) {
    this.tuples = [];
    if (initialTuples && initialTuples.length > 0) {
      this.writeTuples(initialTuples);
    }
  }

  static fromFile(tuplesPath) {
    const raw = fs.readFileSync(tuplesPath, 'utf8');
    const tuples = JSON.parse(raw);
    return new InMemoryFgaEvaluator(tuples);
  }

  writeTuples(tuples) {
    for (const t of tuples) {
      const exists = this.tuples.some(
        (existing) =>
          existing.user === t.user &&
          existing.relation === t.relation &&
          existing.object === t.object
      );
      if (!exists) {
        this.tuples.push({
          user: t.user,
          relation: t.relation,
          object: t.object,
        });
      }
    }
  }

  deleteTuples(tuples) {
    this.tuples = this.tuples.filter(
      (existing) =>
        !tuples.some(
          (t) =>
            t.user === existing.user &&
            t.relation === existing.relation &&
            t.object === existing.object
        )
    );
  }

  /**
   * Checks whether a user has a relation with an object.
   * e.g., check({ user: 'user:alice', relation: 'can_view', object: 'document:salary_bands_2026' })
   */
  async check({ user, relation, object }) {
    const allowed = this.evaluateRelation(user, relation, object, new Set());
    return { allowed };
  }

  /**
   * Batch check multiple permission requests.
   */
  async batchCheck(checks) {
    const results = [];
    for (const item of checks) {
      const res = await this.check(item);
      results.push({
        ...item,
        allowed: res.allowed,
      });
    }
    return results;
  }

  /**
   * List all objects of a given type that user has relation to.
   * e.g., listObjects({ user: 'user:alice', relation: 'can_view', type: 'document' })
   */
  async listObjects({ user, relation, type }) {
    const targetType = type.endsWith(':') ? type.slice(0, -1) : type;
    const allObjects = new Set();
    for (const t of this.tuples) {
      const [objType] = t.object.split(':');
      if (objType === targetType) {
        allObjects.add(t.object);
      }
    }

    const objects = [];
    for (const obj of allObjects) {
      const { allowed } = await this.check({ user, relation, object: obj });
      if (allowed) {
        objects.push(obj);
      }
    }
    return { objects };
  }

  /**
   * Internal recursive resolution of permissions matching model.fga.
   */
  evaluateRelation(user, relation, object, visited) {
    const cycleKey = `${user}|${relation}|${object}`;
    if (visited.has(cycleKey)) {
      return false;
    }
    visited.add(cycleKey);

    const [objType] = object.split(':');

    // Rule 1: Direct tuple match
    for (const t of this.tuples) {
      if (t.object === object && t.relation === relation) {
        if (t.user === user) {
          return true;
        }

        // Rule: userset expansion like role:manager#assignee or department:engineering#member
        if (t.user.includes('#')) {
          const [parentObject, parentRelation] = t.user.split('#');
          if (this.evaluateRelation(user, parentRelation, parentObject, visited)) {
            return true;
          }
        }
      }
    }

    // Rule 2: model.fga specific relation definitions
    if (objType === 'document') {
      if (relation === 'can_view') {
        // define can_view: owner or reader
        const isOwner = this.evaluateRelation(user, 'owner', object, visited);
        if (isOwner) return true;
        const isReader = this.evaluateRelation(user, 'reader', object, visited);
        if (isReader) return true;
        return false;
      }
    }

    return false;
  }
}
