'use strict';

jest.mock('../../src/db/repositories/projectsRepo');
jest.mock('../../src/db/repositories/todosRepo');

const projectsRepo = require('../../src/db/repositories/projectsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { listProjectsWithPinnedTodos } = require('../../src/lib/projectsPinnedTodos');

test('attaches fresh ordered buckets without modifying frozen repository rows', async () => {
    const projects = Object.freeze([3, 1, 2].map((id) => Object.freeze({ id, title: `${id}` })));
    const pins = Object.freeze([
        Object.freeze({ id: 11, project_id: 1, position: 0, is_pinned: 1 }),
        Object.freeze({ id: 12, project_id: 1, position: 1, is_pinned: 1 }),
        Object.freeze({ id: 21, project_id: 2, position: 0, is_pinned: 1 }),
    ]);
    projectsRepo.listByOwnerWithCounts.mockResolvedValue(projects);
    todosRepo.listPinnedByOwner.mockResolvedValue(pins);

    const result = await listProjectsWithPinnedTodos({}, 7);
    const again = await listProjectsWithPinnedTodos({}, 7);

    expect(result.map((project) => project.id)).toEqual([3, 1, 2]);
    expect(result.map((project) => project.pinnedTodos.map((todo) => todo.id)))
        .toEqual([[], [11, 12], [21]]);
    result.forEach((project, index) => {
        expect(project).not.toBe(projects[index]);
        expect(project.pinnedTodos).not.toBe(again[index].pinnedTodos);
    });
    expect(projects.every((project) => !Object.hasOwn(project, 'pinnedTodos'))).toBe(true);
    expect(pins.map((row) => row.id)).toEqual([11, 12, 21]);
});
