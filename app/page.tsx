import { Hero } from "@/components/hub/hero"
import { LabStatement } from "@/components/hub/lab-statement"
import { PrototypeRegistry } from "@/components/hub/prototype-registry"

/**
 * 首页 = Hero（字标 + 定位说明）+ Prototype Registry + 实验室说明。
 * 内容全部来自 lib/prototypes.ts 与 i18n 词典，这里只负责编排顺序。
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <PrototypeRegistry />
      <LabStatement />
    </>
  )
}
