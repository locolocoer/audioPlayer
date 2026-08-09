#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
⚠️⚠️⚠️  警告：这是一个【破坏性】的一次性维护脚本，请谨慎使用！  ⚠️⚠️⚠️

该脚本会扫描并【删除】 ROOT_DIR（默认 E:\\audio）下的所有 .wav 文件，
且路径已硬编码，不保证数据可恢复。

- 直接运行只会进入确认流程，不会立即删除；
- 必须显式附加 `--yes` 参数才会真正执行删除逻辑。
- 仅用于清理冗余 WAV 文件，执行前请自行确认数据安全。
"""

import os
import sys

ROOT_DIR = r"E:\audio"
TEST_LIMIT = 10

def find_wav_files(root):
    wav_files = []
    for dirpath, _, filenames in os.walk(root):
        for f in filenames:
            if f.lower().endswith('.wav'):
                wav_files.append(os.path.join(dirpath, f))
    return wav_files

def test_run(files):
    print(f"\n=== 测试模式: 将删除前 {min(TEST_LIMIT, len(files))} 个文件 ===\n")
    for i, f in enumerate(files[:TEST_LIMIT]):
        size_mb = os.path.getsize(f) / (1024 * 1024)
        print(f"  [{i+1}] {size_mb:.1f}MB  {f}")
    print(f"\n共找到 {len(files)} 个 WAV 文件，测试删除前 {min(TEST_LIMIT, len(files))} 个")
    return input("\n确认删除测试文件? (y/n): ").strip().lower()

def delete_files(files, confirm_msg):
    ans = input(f"\n{confirm_msg} ({len(files)} 个文件)? (y/n): ").strip().lower()
    if ans != 'y':
        print("已取消")
        return
    deleted = 0
    errors = 0
    total = len(files)
    for i, f in enumerate(files):
        try:
            os.remove(f)
            deleted += 1
            if (i + 1) % 100 == 0:
                print(f"  进度: {i+1}/{total}")
        except Exception as e:
            errors += 1
            print(f"  错误: {f} -> {e}")
    print(f"\n完成: 删除 {deleted} 个, 失败 {errors} 个")

def main():
    if "--yes" not in sys.argv:
        print("=" * 60)
        print("⚠️  这是破坏性删除脚本！")
        print("    它会删除 WAV 文件，且路径已硬编码，请勿误执行。")
        print("    如确认要继续，请附加 --yes 参数，例如：")
        print("      python delete_wav.py --yes")
        print("=" * 60)
        sys.exit(0)

    if not os.path.exists(ROOT_DIR):
        print(f"目录不存在: {ROOT_DIR}")
        sys.exit(1)

    wav_files = find_wav_files(ROOT_DIR)
    if not wav_files:
        print(f"在 {ROOT_DIR} 下未找到 WAV 文件")
        return

    print(f"在 {ROOT_DIR} 下找到 {len(wav_files)} 个 WAV 文件")

    # Step 1: Test run
    if len(wav_files) <= TEST_LIMIT:
        # Show all files
        for i, f in enumerate(wav_files):
            size_mb = os.path.getsize(f) / (1024 * 1024)
            print(f"  [{i+1}] {size_mb:.1f}MB  {f}")
        ans = input(f"\n共 {len(wav_files)} 个文件。确认全部删除? (y/n): ").strip().lower()
        if ans == 'y':
            delete_files(wav_files, "确认删除全部")
    else:
        # Show test subset first
        ans = test_run(wav_files)
        if ans == 'y':
            test_files = wav_files[:TEST_LIMIT]
            delete_files(test_files, f"确认删除前 {TEST_LIMIT} 个测试文件")

            # Step 2: Full run
            remaining = wav_files[TEST_LIMIT:]
            if remaining:
                ans2 = input(f"\n测试完成。是否删除剩余 {len(remaining)} 个文件? (y/n): ").strip().lower()
                if ans2 == 'y':
                    delete_files(remaining, "确认删除剩余")

if __name__ == "__main__":
    main()
