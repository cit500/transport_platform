# 路网数据导出工具

该工具把 MySQL 中的路网节点和边导出为 CSV、JSON、GeoJSON、图结构和统计文件。导出结果默认写入项目根目录的 `exports/`，该目录不纳入版本控制。

```powershell
python -m pip install -r requirements.txt
$env:PLANT_DB_PASSWORD = 'your-password'
python export_road_network.py
```

可选环境变量：`PLANT_DB_HOST`、`PLANT_DB_PORT`、`PLANT_DB_USERNAME`、`PLANT_DB_PASSWORD`、`PLANT_DB_NAME`、`PLANT_EXPORT_DIR`。
