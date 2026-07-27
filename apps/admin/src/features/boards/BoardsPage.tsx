import { LockOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import {
  useAddChecklistItemMutation,
  useAddCommentMutation,
  useCreateBoardMutation,
  useCreateCardMutation,
  useCreateListMutation,
  useGetBoardQuery,
  useGetBoardsQuery,
  useMoveCardMutation,
  useReclassifyBoardMutation,
  useToggleChecklistItemMutation,
  type BoardCard,
  type BoardVisibility,
} from './boardsApi';

const { Text, Title } = Typography;

function VisibilityTag({ visibility }: { visibility: BoardVisibility }) {
  return visibility === 'DIRECTOR_CONFIDENTIAL' ? (
    <Tag color="red" icon={<LockOutlined />}>
      DIRECTOR-CONFIDENTIAL
    </Tag>
  ) : (
    <Tag color="blue" icon={<TeamOutlined />}>
      TEAM
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Card drawer: details, move, checklist, comments
// ---------------------------------------------------------------------------
function CardDrawer({
  boardId,
  card,
  lists,
  onClose,
  refetchBoard,
}: {
  boardId: string;
  card: BoardCard;
  lists: { id: string; name: string }[];
  onClose: () => void;
  refetchBoard: () => void;
}) {
  const { message } = App.useApp();
  const [moveCard, moveState] = useMoveCardMutation();
  const [addChecklistItem] = useAddChecklistItemMutation();
  const [toggleChecklistItem] = useToggleChecklistItemMutation();
  const [addComment, commentState] = useAddCommentMutation();
  const [newItem, setNewItem] = useState('');
  const [newComment, setNewComment] = useState('');

  const move = async (listId: string) => {
    if (listId === card.listId) return;
    try {
      await moveCard({ boardId, cardId: card.id, listId, position: 0 }).unwrap();
      message.success('Card moved');
      refetchBoard();
      onClose();
    } catch {
      message.error('Failed to move card');
    }
  };

  const addItem = async () => {
    if (!newItem.trim()) return;
    try {
      await addChecklistItem({ boardId, cardId: card.id, text: newItem.trim() }).unwrap();
      setNewItem('');
      refetchBoard();
    } catch {
      message.error('Failed to add item');
    }
  };

  const toggleItem = async (itemId: string, done: boolean) => {
    try {
      await toggleChecklistItem({ boardId, itemId, done }).unwrap();
      refetchBoard();
    } catch {
      message.error('Failed to update item');
    }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    try {
      await addComment({ boardId, cardId: card.id, body: newComment.trim() }).unwrap();
      setNewComment('');
      refetchBoard();
    } catch {
      message.error('Failed to add comment');
    }
  };

  return (
    <Drawer open width={480} onClose={onClose} title={card.title}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {card.description && <Text type="secondary">{card.description}</Text>}
        <div>
          <Text strong>Due: </Text>
          <Text>{card.dueDate ? dayjs(card.dueDate).format('YYYY-MM-DD') : '—'}</Text>
        </div>
        <div>
          <Text strong>Assignee: </Text>
          <Text>{card.assigneeId ?? '—'}</Text>
        </div>

        <div>
          <Text strong>Move to list</Text>
          <Select
            style={{ width: '100%', marginTop: 8 }}
            value={card.listId}
            loading={moveState.isLoading}
            onChange={move}
            options={lists.map((l) => ({ value: l.id, label: l.name }))}
          />
        </div>

        <div>
          <Title level={5}>Checklist</Title>
          <List
            size="small"
            locale={{ emptyText: 'No items' }}
            dataSource={card.checklistItems}
            renderItem={(item) => (
              <List.Item>
                <Checkbox
                  checked={item.done}
                  onChange={(e) => toggleItem(item.id, e.target.checked)}
                >
                  <span style={{ textDecoration: item.done ? 'line-through' : undefined }}>
                    {item.text}
                  </span>
                </Checkbox>
              </List.Item>
            )}
          />
          <Space.Compact style={{ width: '100%', marginTop: 8 }}>
            <Input
              placeholder="Add checklist item"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onPressEnter={addItem}
            />
            <Button onClick={addItem}>Add</Button>
          </Space.Compact>
        </div>

        <div>
          <Title level={5}>Comments</Title>
          <List
            size="small"
            locale={{ emptyText: 'No comments' }}
            dataSource={card.comments}
            renderItem={(c) => (
              <List.Item>
                <List.Item.Meta
                  title={<Text style={{ fontSize: 12 }}>{dayjs(c.createdAt).format('YYYY-MM-DD HH:mm')}</Text>}
                  description={c.body}
                />
              </List.Item>
            )}
          />
          <Space.Compact style={{ width: '100%', marginTop: 8 }}>
            <Input
              placeholder="Add a comment"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onPressEnter={postComment}
            />
            <Button loading={commentState.isLoading} onClick={postComment}>
              Post
            </Button>
          </Space.Compact>
        </div>
      </Space>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Board detail: lists as columns
// ---------------------------------------------------------------------------
function BoardDetailView({ boardId }: { boardId: string }) {
  const { data: board, isLoading, isFetching, refetch } = useGetBoardQuery(boardId);
  const { message } = App.useApp();
  const [createList] = useCreateListMutation();
  const [createCard] = useCreateCardMutation();
  const [reclassify, reclassifyState] = useReclassifyBoardMutation();

  const [listModal, setListModal] = useState(false);
  const [listForm] = Form.useForm();
  const [cardModalList, setCardModalList] = useState<string | null>(null);
  const [cardForm] = Form.useForm();
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);

  const lists = useMemo(() => board?.lists ?? [], [board]);

  if (isLoading) return <Spin style={{ marginTop: 40 }} />;
  if (!board) return <Empty description="Board not found" style={{ marginTop: 40 }} />;

  const submitList = async (v: { name: string }) => {
    try {
      await createList({ boardId, name: v.name }).unwrap();
      message.success('List created');
      setListModal(false);
      listForm.resetFields();
      refetch();
    } catch {
      message.error('Failed to create list');
    }
  };

  const submitCard = async (v: { title: string; description?: string; assigneeId?: string; dueDate?: dayjs.Dayjs }) => {
    if (!cardModalList) return;
    try {
      await createCard({
        boardId,
        listId: cardModalList,
        title: v.title,
        description: v.description || undefined,
        assigneeId: v.assigneeId || undefined,
        dueDate: v.dueDate ? v.dueDate.toISOString() : undefined,
      }).unwrap();
      message.success('Card created');
      setCardModalList(null);
      cardForm.resetFields();
      refetch();
    } catch {
      message.error('Failed to create card');
    }
  };

  const doReclassify = () => {
    const next: BoardVisibility =
      board.visibility === 'DIRECTOR_CONFIDENTIAL' ? 'TEAM' : 'DIRECTOR_CONFIDENTIAL';
    Modal.confirm({
      title: 'Reclassify board visibility',
      content: `Change visibility from ${board.visibility} to ${next}? This is a director-only action and is audited.`,
      okText: 'Reclassify',
      okButtonProps: { danger: next === 'DIRECTOR_CONFIDENTIAL' },
      onOk: async () => {
        try {
          await reclassify({ id: boardId, visibility: next }).unwrap();
          message.success('Visibility reclassified');
          refetch();
        } catch {
          message.error('Reclassify failed (director-only)');
        }
      },
    });
  };

  const listOptions = lists.map((l) => ({ id: l.id, name: l.name }));

  return (
    <div>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }} align="start">
        <Space direction="vertical" size={4}>
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              {board.name}
            </Title>
            <VisibilityTag visibility={board.visibility} />
          </Space>
          {board.description && <Text type="secondary">{board.description}</Text>}
        </Space>
        <Space>
          <Button
            danger={board.visibility !== 'DIRECTOR_CONFIDENTIAL'}
            loading={reclassifyState.isLoading}
            icon={<LockOutlined />}
            onClick={doReclassify}
          >
            Reclassify visibility
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => setListModal(true)}>
            Add list
          </Button>
        </Space>
      </Space>

      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, opacity: isFetching ? 0.6 : 1 }}>
        {lists.length === 0 && <Empty description="No lists yet" />}
        {lists.map((list) => (
          <div key={list.id} style={{ minWidth: 280, width: 280, flexShrink: 0 }}>
            <Card
              size="small"
              title={`${list.name} (${list.cards.length})`}
              styles={{ body: { background: '#fafafa' } }}
              extra={
                <Button type="link" size="small" onClick={() => setCardModalList(list.id)}>
                  + Card
                </Button>
              }
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {list.cards.length === 0 && <Text type="secondary">No cards</Text>}
                {list.cards.map((card) => (
                  <Card
                    key={card.id}
                    size="small"
                    hoverable
                    onClick={() => setActiveCard(card)}
                    styles={{ body: { padding: 8 } }}
                  >
                    <Text>{card.title}</Text>
                    <div style={{ marginTop: 4 }}>
                      <Space size={4} wrap>
                        {card.dueDate && (
                          <Tag color="gold">{dayjs(card.dueDate).format('MMM D')}</Tag>
                        )}
                        {card.checklistItems.length > 0 && (
                          <Tag>
                            {card.checklistItems.filter((i) => i.done).length}/
                            {card.checklistItems.length}
                          </Tag>
                        )}
                        {card.comments.length > 0 && <Tag>{card.comments.length} 💬</Tag>}
                      </Space>
                    </div>
                  </Card>
                ))}
              </Space>
            </Card>
          </div>
        ))}
      </div>

      <Modal
        open={listModal}
        title="Add list"
        onCancel={() => setListModal(false)}
        onOk={() => listForm.submit()}
        okText="Create"
      >
        <Form form={listForm} layout="vertical" onFinish={submitList}>
          <Form.Item name="name" label="List name" rules={[{ required: true }]}>
            <Input placeholder="To Do" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={cardModalList !== null}
        title="Add card"
        onCancel={() => setCardModalList(null)}
        onOk={() => cardForm.submit()}
        okText="Create"
      >
        <Form form={cardForm} layout="vertical" onFinish={submitCard}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input placeholder="Draft the proposal" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="assigneeId" label="Assignee (user id)">
            <Input placeholder="UUID (optional)" />
          </Form.Item>
          <Form.Item name="dueDate" label="Due date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {activeCard && (
        <CardDrawer
          boardId={boardId}
          card={
            // resolve the freshest version of the card from the board data
            lists.flatMap((l) => l.cards).find((c) => c.id === activeCard.id) ?? activeCard
          }
          lists={listOptions}
          onClose={() => setActiveCard(null)}
          refetchBoard={refetch}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page: left board list + selected board detail
// ---------------------------------------------------------------------------
export function BoardsPage() {
  const { data: boards, isLoading, refetch } = useGetBoardsQuery();
  const { message } = App.useApp();
  const [createBoard, createState] = useCreateBoardMutation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardModal, setBoardModal] = useState(false);
  const [boardForm] = Form.useForm();

  const submitBoard = async (v: { name: string; description?: string; visibility?: BoardVisibility }) => {
    try {
      const created = await createBoard({
        name: v.name,
        description: v.description || undefined,
        visibility: v.visibility ?? 'TEAM',
      }).unwrap();
      message.success('Board created');
      setBoardModal(false);
      boardForm.resetFields();
      refetch();
      setSelectedId(created.id);
    } catch {
      message.error('Failed to create board (confidential requires a director)');
    }
  };

  return (
    <>
      <Title level={3} style={{ marginTop: 0 }}>
        Boards
      </Title>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ width: 260, flexShrink: 0 }}>
          <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
            <Text strong>My boards</Text>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setBoardModal(true)}>
              New
            </Button>
          </Space>
          <List
            loading={isLoading}
            locale={{ emptyText: 'No boards' }}
            dataSource={boards ?? []}
            renderItem={(b) => (
              <List.Item
                onClick={() => setSelectedId(b.id)}
                style={{
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: b.id === selectedId ? '#e6f4ff' : undefined,
                }}
              >
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text strong>{b.name}</Text>
                  <VisibilityTag visibility={b.visibility} />
                </Space>
              </List.Item>
            )}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedId ? (
            <BoardDetailView boardId={selectedId} />
          ) : (
            <Empty description="Select a board" style={{ marginTop: 60 }} />
          )}
        </div>
      </div>

      <Modal
        open={boardModal}
        title="New board"
        onCancel={() => setBoardModal(false)}
        onOk={() => boardForm.submit()}
        okText="Create"
        confirmLoading={createState.isLoading}
      >
        <Form form={boardForm} layout="vertical" onFinish={submitBoard} initialValues={{ visibility: 'TEAM' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Q3 Growth Plan" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="visibility" label="Visibility">
            <Select
              options={[
                { value: 'TEAM', label: 'Team (all staff)' },
                { value: 'DIRECTOR_CONFIDENTIAL', label: 'Director-Confidential (directors only)' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default BoardsPage;
