from alembic import command, config

cfg = config.Config('alembic.ini')
command.upgrade(cfg, 'head')
print('ALEMBIC_UPGRADE_HEAD_OK')
