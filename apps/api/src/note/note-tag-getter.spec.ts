import { NoteService } from './note.service';
import { ApiException } from '../common/api.exception';

describe('NoteService.getTag', () => {
  const ownerId = '1';
  let tags: { findOne: jest.Mock };
  let service: NoteService;

  beforeEach(() => {
    tags = { findOne: jest.fn() };
    service = new NoteService({} as never, tags as never, {} as never);
  });

  it('returns the owner-scoped tag', async () => {
    tags.findOne.mockResolvedValueOnce({ id: '4', ownerId, name: 'work', color: '#fff' });

    const result = await service.getTag(ownerId, '4');

    expect(tags.findOne).toHaveBeenCalledWith({ where: { id: '4', ownerId } });
    expect(result).toMatchObject({ id: '4', name: 'work' });
  });

  it('throws notFound for a missing or foreign tag', async () => {
    tags.findOne.mockResolvedValueOnce(null);

    await expect(service.getTag(ownerId, '404')).rejects.toBeInstanceOf(ApiException);
  });
});
